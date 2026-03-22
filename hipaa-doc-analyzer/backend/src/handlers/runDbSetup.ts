/**
 * One-off Lambda to create hipaa_analyzer DB, analyzer_user, and run schema.
 * Run from inside the VPC (same as other Lambdas). Invoke once after deploy.
 */
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool } from 'pg';

const secrets = new SecretsManagerClient({});
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL,
  user_id               VARCHAR(255) NOT NULL,
  action                VARCHAR(100) NOT NULL,
  phi_entities_detected INTEGER DEFAULT 0,
  phi_types_found       TEXT[],
  model_used            VARCHAR(100),
  analysis_type         VARCHAR(100),
  status                VARCHAR(50) DEFAULT 'SUCCESS',
  error_message         TEXT,
  duration_ms           INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS phi_token_maps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL UNIQUE,
  encrypted_map     TEXT NOT NULL,
  entity_count      INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE TABLE IF NOT EXISTS analysis_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL UNIQUE,
  user_id         VARCHAR(255) NOT NULL,
  analysis_type   VARCHAR(100) NOT NULL,
  summary         TEXT NOT NULL,
  phi_detected    BOOLEAN DEFAULT FALSE,
  entity_count    INTEGER DEFAULT 0,
  model_used      VARCHAR(100),
  analysis_status VARCHAR(50) DEFAULT 'COMPLETE',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_document_id ON audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_phi_token_maps_expires_at ON phi_token_maps(expires_at);
CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id);
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS redacted_document_text TEXT;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS analysis_status VARCHAR(50);
UPDATE analysis_results SET analysis_status = 'COMPLETE' WHERE analysis_status IS NULL;
CREATE TABLE IF NOT EXISTS saved_summaries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         VARCHAR(255) NOT NULL,
  document_id     UUID NOT NULL,
  file_name       VARCHAR(512) NOT NULL,
  analysis_type   VARCHAR(100) NOT NULL,
  summary         TEXT NOT NULL,
  phi_detected    BOOLEAN DEFAULT FALSE,
  entities_redacted INTEGER DEFAULT 0,
  model_used        VARCHAR(100),
  saved_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_summaries_user_saved_at ON saved_summaries (user_id, saved_at DESC);
CREATE TABLE IF NOT EXISTS document_shares (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL,
  owner_user_id       VARCHAR(255) NOT NULL,
  shared_with_user_id VARCHAR(255) NOT NULL,
  file_name           VARCHAR(512) DEFAULT 'Document',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (document_id, shared_with_user_id)
);
CREATE INDEX IF NOT EXISTS idx_document_shares_shared_with ON document_shares (shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_document_shares_document ON document_shares (document_id);
ALTER TABLE document_shares ADD COLUMN IF NOT EXISTS shared_with_email VARCHAR(512);
CREATE TABLE IF NOT EXISTS app_config (
  key   VARCHAR(128) PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_grants (
  cognito_sub     VARCHAR(128) PRIMARY KEY,
  granted_by_sub  VARCHAR(128),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_grants_created ON admin_grants (created_at);
`;

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  const secretArn = process.env.DB_SECRET_ARN!;
  const dbHost = process.env.DB_HOST!;
  const dbPort = parseInt(process.env.DB_PORT || '5432');
  const appUserPassword = process.env.DB_PASSWORD!;

  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const raw = res.SecretString;
  if (!raw) throw new Error('Empty secret');
  const creds = JSON.parse(raw) as { username: string; password: string };
  const masterUser = creds.username;
  const masterPassword = creds.password;

  const masterPool = new Pool({
    host: dbHost,
    port: dbPort,
    database: 'postgres',
    user: masterUser,
    password: masterPassword,
    ssl: { rejectUnauthorized: false },
    max: 1
  });

  try {
    await masterPool.query('CREATE DATABASE hipaa_analyzer');
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== '42P04') throw e; // 42P04 = already exists
  }

  // Escape single quotes for use in SQL literal (no other chars need escaping for PASSWORD)
  const escapedPassword = appUserPassword.replace(/'/g, "''");
  try {
    await masterPool.query(`CREATE USER analyzer_user WITH PASSWORD '${escapedPassword}'`);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== '42710') throw e; // 42710 = role already exists
    // Sync password when user already exists (e.g. after redeploy with same dbPassword)
    await masterPool.query(`ALTER USER analyzer_user WITH PASSWORD '${escapedPassword}'`);
  }

  await masterPool.query('GRANT ALL PRIVILEGES ON DATABASE hipaa_analyzer TO analyzer_user');
  await masterPool.end();

  const masterPoolAnalyzer = new Pool({
    host: dbHost,
    port: dbPort,
    database: 'hipaa_analyzer',
    user: masterUser,
    password: masterPassword,
    ssl: { rejectUnauthorized: false },
    max: 1
  });
  await masterPoolAnalyzer.query('GRANT ALL ON SCHEMA public TO analyzer_user');
  await masterPoolAnalyzer.query('GRANT CREATE ON SCHEMA public TO analyzer_user');
  await masterPoolAnalyzer.end();

  const appPool = new Pool({
    host: dbHost,
    port: dbPort,
    database: 'hipaa_analyzer',
    user: 'analyzer_user',
    password: appUserPassword,
    ssl: { rejectUnauthorized: false },
    max: 1
  });

  for (const stmt of SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean)) {
    await appPool.query(stmt);
  }
  await appPool.end();

  return { statusCode: 200, body: JSON.stringify({ message: 'Database setup complete' }) };
};

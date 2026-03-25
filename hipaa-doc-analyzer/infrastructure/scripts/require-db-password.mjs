#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, '..', '.env.deploy') });

/**
 * Ensures DB_PASSWORD is set before `npm run deploy:frontend`.
 * CDK bakes this into Lambda env; it must match analyzer_user in RDS (RunDbSetup sets/updates that).
 */
const p = process.env.DB_PASSWORD?.trim();
if (!p) {
  console.error(
    'Missing DB_PASSWORD. Without it, CDK cannot set Lambda DB credentials (or synth may fail).\n' +
      '  Put DB_PASSWORD in infrastructure/.env.deploy (gitignored), or:\n' +
      '  export DB_PASSWORD="your-app-user-password"\n' +
      '  npm run deploy:frontend\n' +
      '\n' +
      'After the first deploy (or whenever you change this password), invoke RunDbSetup once so Postgres\n' +
      'analyzer_user matches Lambdas (stack output RunDbSetupFunctionName):\n' +
      '  aws lambda invoke --function-name "<RunDbSetupFn-name>" --cli-binary-format raw-in-base64-out out.json && cat out.json\n' +
      '\n' +
      'If you deploy only with -c dbPassword=... and no env var, run build + cdk manually instead of deploy:frontend.\n'
  );
  process.exit(1);
}

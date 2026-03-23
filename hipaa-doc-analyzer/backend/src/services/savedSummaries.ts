import { Pool } from 'pg';
import type { AnalysisType } from '../types';
import { syncFileNameForDocumentShares } from './documentShares';

/** Strip NULs (break some PG clients) and trim for display name. */
export function sanitizeSavedFileName(name: string): string {
  return name.replace(/\0/g, '').trim();
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  max: 5
});

export interface SavedSummaryRow {
  id: string;
  document_id: string;
  file_name: string;
  analysis_type: string;
  summary: string;
  phi_detected: boolean;
  entities_redacted: number;
  model_used: string | null;
  saved_at: string;
  /** Rows in document_shares where this user is owner (outgoing shares). */
  share_count: number;
}

export async function upsertSavedSummary(params: {
  tenantId: string;
  userId: string;
  documentId: string;
  fileName: string;
  analysisType: AnalysisType;
  summary: string;
  phiDetected: boolean;
  entitiesRedacted: number;
  modelUsed: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO saved_summaries (
      tenant_id, user_id, document_id, file_name, analysis_type, summary,
      phi_detected, entities_redacted, model_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (tenant_id, user_id, document_id) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      analysis_type = EXCLUDED.analysis_type,
      summary = EXCLUDED.summary,
      phi_detected = EXCLUDED.phi_detected,
      entities_redacted = EXCLUDED.entities_redacted,
      model_used = EXCLUDED.model_used,
      saved_at = NOW()`,
    [
      params.tenantId,
      params.userId,
      params.documentId,
      sanitizeSavedFileName(params.fileName).slice(0, 512),
      params.analysisType,
      params.summary,
      params.phiDetected,
      params.entitiesRedacted,
      params.modelUsed.slice(0, 100)
    ]
  );
}

const LIST_SAVED_WITH_SHARES = `
  SELECT ss.id::text,
         ss.document_id::text,
         ss.file_name,
         ss.analysis_type,
         ss.summary,
         ss.phi_detected,
         ss.entities_redacted,
         ss.model_used,
         ss.saved_at::text,
         COALESCE(cnt.share_count, 0) AS share_count
  FROM saved_summaries ss
  LEFT JOIN (
    SELECT document_id,
           owner_user_id,
           tenant_id,
           COUNT(*)::int AS share_count
    FROM document_shares
    GROUP BY document_id, owner_user_id, tenant_id
  ) cnt ON cnt.document_id = ss.document_id AND cnt.owner_user_id = ss.user_id AND cnt.tenant_id = ss.tenant_id
  WHERE ss.user_id = $1 AND ss.tenant_id = $2
  ORDER BY ss.saved_at DESC
`;

const LIST_SAVED_NO_SHARES = `
  SELECT ss.id::text,
         ss.document_id::text,
         ss.file_name,
         ss.analysis_type,
         ss.summary,
         ss.phi_detected,
         ss.entities_redacted,
         ss.model_used,
         ss.saved_at::text,
         0 AS share_count
  FROM saved_summaries ss
  WHERE ss.user_id = $1 AND ss.tenant_id = $2
  ORDER BY ss.saved_at DESC
`;

/** Legacy lists without tenant_id column (pre-migration). */
const LIST_SAVED_LEGACY = `
  SELECT ss.id::text,
         ss.document_id::text,
         ss.file_name,
         ss.analysis_type,
         ss.summary,
         ss.phi_detected,
         ss.entities_redacted,
         ss.model_used,
         ss.saved_at::text,
         0 AS share_count
  FROM saved_summaries ss
  WHERE ss.user_id = $1
  ORDER BY ss.saved_at DESC
`;

export async function listSavedSummaries(userId: string, tenantId: string): Promise<SavedSummaryRow[]> {
  let result;
  try {
    result = await pool.query(LIST_SAVED_WITH_SHARES, [userId, tenantId]);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    const msg = String((e as { message?: string })?.message ?? '');
    if (code === '42703' && /tenant_id/i.test(msg)) {
      result = await pool.query(LIST_SAVED_LEGACY, [userId]);
    } else if (code === '42P01' || code === '42501') {
      console.warn('listSavedSummaries: falling back without share counts:', code);
      try {
        result = await pool.query(LIST_SAVED_NO_SHARES, [userId, tenantId]);
      } catch (e2: unknown) {
        const c2 = (e2 as { code?: string })?.code;
        const m2 = String((e2 as { message?: string })?.message ?? '');
        if (c2 === '42703' && /tenant_id/i.test(m2)) {
          result = await pool.query(LIST_SAVED_LEGACY, [userId]);
        } else {
          throw e2;
        }
      }
    } else {
      throw e;
    }
  }
  return result.rows.map((r) => ({
    ...r,
    share_count: Number(r.share_count) || 0
  })) as SavedSummaryRow[];
}

/**
 * Renames the stored document object to match the new display name.
 * Keys are `uploads/{userId}/{documentId}/{fileName}` — DB-only renames break presigned view URLs.
 * S3 client is loaded only when this runs (dynamic import), so GET /saved-summaries does not require S3.
 */
export async function renameSavedSummaryFileName(params: {
  tenantId: string;
  userId: string;
  documentId: string;
  fileName: string;
}): Promise<boolean> {
  const newName = sanitizeSavedFileName(params.fileName).slice(0, 512);
  if (!newName) return false;

  let oldName: string | undefined;
  const withTenant = await pool.query<{ file_name: string }>(
    `SELECT file_name FROM saved_summaries
     WHERE user_id = $1 AND document_id = $2::uuid AND tenant_id = $3`,
    [params.userId, params.documentId, params.tenantId]
  );
  if (withTenant.rows.length > 0) {
    oldName = withTenant.rows[0]!.file_name;
  } else {
    const legacy = await pool.query<{ file_name: string }>(
      `SELECT file_name FROM saved_summaries WHERE user_id = $1 AND document_id = $2::uuid`,
      [params.userId, params.documentId]
    );
    if (legacy.rows.length === 0) return false;
    oldName = legacy.rows[0]!.file_name;
  }
  if (oldName === newName) return true;

  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    console.error('renameSavedSummaryFileName: S3_BUCKET_NAME not set');
    return false;
  }

  const oldKey = `uploads/${params.userId}/${params.documentId}/${oldName}`;
  const newKey = `uploads/${params.userId}/${params.documentId}/${newName}`;

  const { renameUploadedDocumentObject } = await import('./documentS3Rename');
  await renameUploadedDocumentObject(bucket, oldKey, newKey);

  const result = await pool.query(
    `UPDATE saved_summaries
     SET file_name = $4
     WHERE user_id = $1 AND document_id = $2::uuid AND tenant_id = $3`,
    [params.userId, params.documentId, params.tenantId, newName]
  );
  if ((result.rowCount ?? 0) === 0) {
    await pool.query(
      `UPDATE saved_summaries SET file_name = $3 WHERE user_id = $1 AND document_id = $2::uuid`,
      [params.userId, params.documentId, newName]
    );
  }

  try {
    await syncFileNameForDocumentShares({
      tenantId: params.tenantId,
      ownerUserId: params.userId,
      documentId: params.documentId,
      fileName: newName
    });
  } catch (shareSyncErr) {
    console.error('syncFileNameForDocumentShares after rename:', shareSyncErr);
  }

  return true;
}

export async function deleteSavedSummary(
  tenantId: string,
  userId: string,
  documentId: string
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM saved_summaries WHERE tenant_id = $1 AND user_id = $2 AND document_id = $3::uuid`,
    [tenantId, userId, documentId]
  );
  if ((result.rowCount ?? 0) > 0) return true;
  const legacy = await pool.query(
    `DELETE FROM saved_summaries WHERE user_id = $1 AND document_id = $2::uuid`,
    [userId, documentId]
  );
  return (legacy.rowCount ?? 0) > 0;
}

import { Pool } from 'pg';
import type { AnalysisType } from '../types';

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
      user_id, document_id, file_name, analysis_type, summary,
      phi_detected, entities_redacted, model_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (user_id, document_id) DO UPDATE SET
      file_name = EXCLUDED.file_name,
      analysis_type = EXCLUDED.analysis_type,
      summary = EXCLUDED.summary,
      phi_detected = EXCLUDED.phi_detected,
      entities_redacted = EXCLUDED.entities_redacted,
      model_used = EXCLUDED.model_used,
      saved_at = NOW()`,
    [
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
           COUNT(*)::int AS share_count
    FROM document_shares
    GROUP BY document_id, owner_user_id
  ) cnt ON cnt.document_id = ss.document_id AND cnt.owner_user_id = ss.user_id
  WHERE ss.user_id = $1
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
  WHERE ss.user_id = $1
  ORDER BY ss.saved_at DESC
`;

export async function listSavedSummaries(userId: string): Promise<SavedSummaryRow[]> {
  let result;
  try {
    result = await pool.query(LIST_SAVED_WITH_SHARES, [userId]);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === '42P01') {
      result = await pool.query(LIST_SAVED_NO_SHARES, [userId]);
    } else {
      throw e;
    }
  }
  return result.rows.map((r) => ({
    ...r,
    share_count: Number(r.share_count) || 0
  })) as SavedSummaryRow[];
}

export async function renameSavedSummaryFileName(params: {
  userId: string;
  documentId: string;
  fileName: string;
}): Promise<boolean> {
  const result = await pool.query(
    `UPDATE saved_summaries
     SET file_name = $3
     WHERE user_id = $1 AND document_id = $2::uuid`,
    [params.userId, params.documentId, sanitizeSavedFileName(params.fileName).slice(0, 512)]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteSavedSummary(userId: string, documentId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM saved_summaries WHERE user_id = $1 AND document_id = $2::uuid`,
    [userId, documentId]
  );
  return (result.rowCount ?? 0) > 0;
}

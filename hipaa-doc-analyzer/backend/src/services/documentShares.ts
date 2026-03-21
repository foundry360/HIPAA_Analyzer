import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  max: 5
});

export interface DocumentShareRow {
  id: string;
  document_id: string;
  owner_user_id: string;
  shared_with_user_id: string;
  file_name: string;
  created_at: string;
}

export interface SharedWithMeRow {
  share_id: string;
  document_id: string;
  file_name: string;
  analysis_type: string;
  summary: string;
  phi_detected: boolean;
  entities_redacted: number;
  model_used: string | null;
  shared_at: string;
}

export async function insertDocumentShare(params: {
  documentId: string;
  ownerUserId: string;
  sharedWithUserId: string;
  fileName: string;
}): Promise<DocumentShareRow> {
  const result = await pool.query(
    `INSERT INTO document_shares (
       document_id, owner_user_id, shared_with_user_id, file_name
     ) VALUES ($1, $2, $3, $4)
     RETURNING id::text, document_id::text, owner_user_id, shared_with_user_id,
               file_name, created_at::text`,
    [
      params.documentId,
      params.ownerUserId,
      params.sharedWithUserId,
      params.fileName.slice(0, 512)
    ]
  );
  return result.rows[0] as DocumentShareRow;
}

export async function listSharesForDocument(
  ownerUserId: string,
  documentId: string
): Promise<DocumentShareRow[]> {
  const result = await pool.query(
    `SELECT id::text, document_id::text, owner_user_id, shared_with_user_id,
            file_name, created_at::text
     FROM document_shares
     WHERE owner_user_id = $1 AND document_id = $2
     ORDER BY created_at ASC`,
    [ownerUserId, documentId]
  );
  return result.rows as DocumentShareRow[];
}

export async function listSharedWithMe(userId: string): Promise<SharedWithMeRow[]> {
  const result = await pool.query(
    `SELECT ds.id::text AS share_id,
            ds.document_id::text,
            ds.file_name,
            ar.analysis_type,
            ar.summary,
            ar.phi_detected,
            ar.entity_count AS entities_redacted,
            ar.model_used,
            ds.created_at::text AS shared_at
     FROM document_shares ds
     JOIN analysis_results ar
       ON ar.document_id = ds.document_id AND ar.user_id = ds.owner_user_id
     WHERE ds.shared_with_user_id = $1
       AND COALESCE(ar.analysis_status, 'COMPLETE') = 'COMPLETE'
     ORDER BY ds.created_at DESC`,
    [userId]
  );
  return result.rows as SharedWithMeRow[];
}

export async function deleteShare(shareId: string, ownerUserId: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM document_shares WHERE id = $1 AND owner_user_id = $2`,
    [shareId, ownerUserId]
  );
  return (result.rowCount ?? 0) > 0;
}

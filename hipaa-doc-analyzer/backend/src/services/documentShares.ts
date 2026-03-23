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
  /** Sign-in email stored at share time; optional for legacy rows. */
  shared_with_email: string | null;
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
  tenantId: string;
  documentId: string;
  ownerUserId: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  fileName: string;
}): Promise<DocumentShareRow> {
  const result = await pool.query(
    `INSERT INTO document_shares (
       tenant_id, document_id, owner_user_id, shared_with_user_id, shared_with_email, file_name
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id::text, document_id::text, owner_user_id, shared_with_user_id,
               shared_with_email, file_name, created_at::text`,
    [
      params.tenantId,
      params.documentId,
      params.ownerUserId,
      params.sharedWithUserId,
      params.sharedWithEmail.slice(0, 512),
      params.fileName.slice(0, 512)
    ]
  );
  return result.rows[0] as DocumentShareRow;
}

export async function listSharesForDocument(
  tenantId: string,
  ownerUserId: string,
  documentId: string
): Promise<DocumentShareRow[]> {
  try {
    const result = await pool.query(
      `SELECT id::text, document_id::text, owner_user_id, shared_with_user_id,
            shared_with_email, file_name, created_at::text
     FROM document_shares
     WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3
     ORDER BY created_at ASC`,
      [tenantId, ownerUserId, documentId]
    );
    return result.rows as DocumentShareRow[];
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? '');
    if ((e as { code?: string })?.code === '42703' && /tenant_id/i.test(msg)) {
      const result = await pool.query(
        `SELECT id::text, document_id::text, owner_user_id, shared_with_user_id,
            shared_with_email, file_name, created_at::text
     FROM document_shares
     WHERE owner_user_id = $1 AND document_id = $2
     ORDER BY created_at ASC`,
        [ownerUserId, documentId]
      );
      return result.rows as DocumentShareRow[];
    }
    throw e;
  }
}

export async function listSharedWithMe(userId: string, tenantId: string): Promise<SharedWithMeRow[]> {
  try {
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
       ON ar.document_id = ds.document_id AND ar.user_id = ds.owner_user_id AND ar.tenant_id = ds.tenant_id
     WHERE ds.shared_with_user_id = $1 AND ds.tenant_id = $2
       AND COALESCE(ar.analysis_status, 'COMPLETE') = 'COMPLETE'
     ORDER BY ds.created_at DESC`,
      [userId, tenantId]
    );
    return result.rows as SharedWithMeRow[];
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? '');
    if ((e as { code?: string })?.code === '42703' && /tenant_id/i.test(msg)) {
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
    throw e;
  }
}

/** Keep denormalized file_name in sync when the owner renames the document. */
export async function syncFileNameForDocumentShares(params: {
  tenantId: string;
  ownerUserId: string;
  documentId: string;
  fileName: string;
}): Promise<void> {
  const name = params.fileName.replace(/\0/g, '').trim().slice(0, 512);
  try {
    await pool.query(
      `UPDATE document_shares SET file_name = $4
     WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3::uuid`,
      [params.tenantId, params.ownerUserId, params.documentId, name]
    );
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? '');
    if ((e as { code?: string })?.code === '42703' && /tenant_id/i.test(msg)) {
      await pool.query(
        `UPDATE document_shares SET file_name = $3
     WHERE owner_user_id = $1 AND document_id = $2::uuid`,
        [params.ownerUserId, params.documentId, name]
      );
      return;
    }
    throw e;
  }
}

export async function deleteShare(
  tenantId: string,
  shareId: string,
  ownerUserId: string
): Promise<boolean> {
  try {
    const result = await pool.query(
      `DELETE FROM document_shares WHERE id = $1 AND owner_user_id = $2 AND tenant_id = $3`,
      [shareId, ownerUserId, tenantId]
    );
    if ((result.rowCount ?? 0) > 0) return true;
  } catch (e: unknown) {
    const msg = String((e as { message?: string })?.message ?? '');
    if ((e as { code?: string })?.code === '42703' && /tenant_id/i.test(msg)) {
      const result = await pool.query(
        `DELETE FROM document_shares WHERE id = $1 AND owner_user_id = $2`,
        [shareId, ownerUserId]
      );
      return (result.rowCount ?? 0) > 0;
    }
    throw e;
  }
  const legacy = await pool.query(
    `DELETE FROM document_shares WHERE id = $1 AND owner_user_id = $2`,
    [shareId, ownerUserId]
  );
  return (legacy.rowCount ?? 0) > 0;
}

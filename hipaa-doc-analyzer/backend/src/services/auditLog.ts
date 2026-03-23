import { Pool } from 'pg';
import { AnalysisJobStatus, AnalysisType, AuditEntry } from '../types';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  max: 5
});

// HIPAA requires logging every PHI access event
// CRITICAL: Never log PHI values — only document IDs, user IDs, metadata
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (
      tenant_id, document_id, user_id, action,
      phi_entities_detected, phi_types_found,
      model_used, analysis_type, status,
      error_message, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entry.tenantId,
      entry.documentId,
      entry.userId,
      entry.action,
      entry.phiEntitiesDetected,
      entry.phiTypesFound,
      entry.modelUsed,
      entry.analysisType,
      entry.status,
      entry.errorMessage || null,
      entry.durationMs
    ]
  );
}

export async function storeAnalysisResult(
  documentId: string,
  userId: string,
  tenantId: string,
  analysisType: string,
  summary: string,
  phiDetected: boolean,
  entityCount: number,
  modelUsed: string
): Promise<void> {
  await pool.query(
    `INSERT INTO analysis_results (
      tenant_id, document_id, user_id, analysis_type,
      summary, phi_detected, entity_count, model_used, analysis_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'COMPLETE')`,
    [tenantId, documentId, userId, analysisType, summary, phiDetected, entityCount, modelUsed]
  );
}

/** Insert row before async worker runs (API Gateway 29s limit). */
export async function createPendingAnalysis(
  documentId: string,
  userId: string,
  tenantId: string,
  analysisType: AnalysisType
): Promise<void> {
  await pool.query(
    `INSERT INTO analysis_results (
      tenant_id, document_id, user_id, analysis_type,
      summary, phi_detected, entity_count, model_used, analysis_status
    ) VALUES ($1, $2, $3, $4, '', false, 0, NULL, 'PENDING')`,
    [tenantId, documentId, userId, analysisType]
  );
}

export async function setAnalysisProcessing(
  documentId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET analysis_status = 'PROCESSING'
     WHERE document_id = $1 AND user_id = $2 AND tenant_id = $3`,
    [documentId, userId, tenantId]
  );
}

export async function updateAnalysisComplete(
  documentId: string,
  userId: string,
  tenantId: string,
  analysisType: string,
  summary: string,
  phiDetected: boolean,
  entityCount: number,
  modelUsed: string,
  /** De-identified full text (Textract + Comprehend); used for document-aware chat. */
  redactedDocumentText: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      analysis_type = $4,
      summary = $5,
      phi_detected = $6,
      entity_count = $7,
      model_used = $8,
      redacted_document_text = $9,
      analysis_status = 'COMPLETE'
     WHERE document_id = $1 AND user_id = $2 AND tenant_id = $3`,
    [documentId, userId, tenantId, analysisType, summary, phiDetected, entityCount, modelUsed, redactedDocumentText]
  );
}

export async function updateAnalysisFailed(
  documentId: string,
  userId: string,
  tenantId: string,
  message: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      summary = $4,
      analysis_status = 'FAILED'
     WHERE document_id = $1 AND user_id = $2 AND tenant_id = $3`,
    [documentId, userId, tenantId, message]
  );
}

/** Reset failed job so POST /analyze can retry */
export async function resetAnalysisToPending(
  documentId: string,
  userId: string,
  tenantId: string,
  analysisType: AnalysisType
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      analysis_type = $4,
      summary = '',
      phi_detected = false,
      entity_count = 0,
      model_used = NULL,
      redacted_document_text = NULL,
      analysis_status = 'PENDING'
     WHERE document_id = $1 AND user_id = $2 AND tenant_id = $3`,
    [documentId, userId, tenantId, analysisType]
  );
}

export interface AnalysisResultRow {
  document_id: string;
  user_id: string;
  analysis_type: string;
  summary: string;
  phi_detected: boolean;
  entity_count: number;
  model_used: string | null;
  analysis_status: AnalysisJobStatus;
  /** De-identified source text for chat; null for analyses completed before this column existed. */
  redacted_document_text: string | null;
}

function isUndefinedColumnError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';
}

/** Missing tenant_id column (pre-migration DB). */
function isTenantColumnError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: string; message?: string };
  if (err.code === '42703' && /tenant_id/i.test(String(err.message))) return true;
  return false;
}

export async function getAnalysisResult(
  documentId: string,
  userId: string,
  tenantId: string
): Promise<AnalysisResultRow | null> {
  const params = [documentId, userId, tenantId];
  try {
    const result = await pool.query(
      `SELECT document_id, user_id, analysis_type, summary,
            phi_detected, entity_count, model_used,
            COALESCE(analysis_status, 'COMPLETE') AS analysis_status,
            redacted_document_text
     FROM analysis_results
     WHERE document_id = $1 AND user_id = $2 AND tenant_id = $3`,
      params
    );
    if (result.rows.length === 0) return null;
    return result.rows[0] as AnalysisResultRow;
  } catch (e) {
    if (!isUndefinedColumnError(e) && !isTenantColumnError(e)) throw e;
    const result = await pool.query(
      `SELECT document_id, user_id, analysis_type, summary,
            phi_detected, entity_count, model_used,
            COALESCE(analysis_status, 'COMPLETE') AS analysis_status
     FROM analysis_results
     WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );
    if (result.rows.length === 0) return null;
    return { ...(result.rows[0] as Omit<AnalysisResultRow, 'redacted_document_text'>), redacted_document_text: null };
  }
}

/** Owner or user named on document_shares for this document (same tenant). */
export async function getAnalysisResultForViewer(
  documentId: string,
  viewerUserId: string,
  tenantId: string
): Promise<AnalysisResultRow | null> {
  const ownerRow = await getAnalysisResult(documentId, viewerUserId, tenantId);
  if (ownerRow) return ownerRow;

  try {
    const params = [documentId, viewerUserId, tenantId];
    try {
      const result = await pool.query(
        `SELECT ar.document_id, ar.user_id, ar.analysis_type, ar.summary,
              ar.phi_detected, ar.entity_count, ar.model_used,
              COALESCE(ar.analysis_status, 'COMPLETE') AS analysis_status,
              ar.redacted_document_text
       FROM analysis_results ar
       INNER JOIN document_shares ds
         ON ds.document_id = ar.document_id
        AND ds.owner_user_id = ar.user_id
        AND ds.shared_with_user_id = $2
        AND ds.tenant_id = $3
       WHERE ar.document_id = $1 AND ar.tenant_id = $3`,
        params
      );
      if (result.rows.length === 0) return null;
      return result.rows[0] as AnalysisResultRow;
    } catch (e) {
      if (!isUndefinedColumnError(e) && !isTenantColumnError(e)) throw e;
      const result = await pool.query(
        `SELECT ar.document_id, ar.user_id, ar.analysis_type, ar.summary,
              ar.phi_detected, ar.entity_count, ar.model_used,
              COALESCE(ar.analysis_status, 'COMPLETE') AS analysis_status
       FROM analysis_results ar
       INNER JOIN document_shares ds
         ON ds.document_id = ar.document_id
        AND ds.owner_user_id = ar.user_id
        AND ds.shared_with_user_id = $2
       WHERE ar.document_id = $1`,
        [documentId, viewerUserId]
      );
      if (result.rows.length === 0) return null;
      return {
        ...(result.rows[0] as Omit<AnalysisResultRow, 'redacted_document_text'>),
        redacted_document_text: null
      };
    }
  } catch {
    return null;
  }
}

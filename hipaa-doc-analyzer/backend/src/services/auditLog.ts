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
      document_id, user_id, action,
      phi_entities_detected, phi_types_found,
      model_used, analysis_type, status,
      error_message, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
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
  analysisType: string,
  summary: string,
  phiDetected: boolean,
  entityCount: number,
  modelUsed: string
): Promise<void> {
  await pool.query(
    `INSERT INTO analysis_results (
      document_id, user_id, analysis_type,
      summary, phi_detected, entity_count, model_used, analysis_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETE')`,
    [documentId, userId, analysisType,
      summary, phiDetected, entityCount, modelUsed]
  );
}

/** Insert row before async worker runs (API Gateway 29s limit). */
export async function createPendingAnalysis(
  documentId: string,
  userId: string,
  analysisType: AnalysisType
): Promise<void> {
  await pool.query(
    `INSERT INTO analysis_results (
      document_id, user_id, analysis_type,
      summary, phi_detected, entity_count, model_used, analysis_status
    ) VALUES ($1, $2, $3, '', false, 0, NULL, 'PENDING')`,
    [documentId, userId, analysisType]
  );
}

export async function setAnalysisProcessing(
  documentId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET analysis_status = 'PROCESSING'
     WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId]
  );
}

export async function updateAnalysisComplete(
  documentId: string,
  userId: string,
  analysisType: string,
  summary: string,
  phiDetected: boolean,
  entityCount: number,
  modelUsed: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      analysis_type = $3,
      summary = $4,
      phi_detected = $5,
      entity_count = $6,
      model_used = $7,
      analysis_status = 'COMPLETE'
     WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId, analysisType,
      summary, phiDetected, entityCount, modelUsed]
  );
}

export async function updateAnalysisFailed(
  documentId: string,
  userId: string,
  message: string
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      summary = $3,
      analysis_status = 'FAILED'
     WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId, message]
  );
}

/** Reset failed job so POST /analyze can retry */
export async function resetAnalysisToPending(
  documentId: string,
  userId: string,
  analysisType: AnalysisType
): Promise<void> {
  await pool.query(
    `UPDATE analysis_results SET
      analysis_type = $3,
      summary = '',
      phi_detected = false,
      entity_count = 0,
      model_used = NULL,
      analysis_status = 'PENDING'
     WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId, analysisType]
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
}

export async function getAnalysisResult(
  documentId: string,
  userId: string
): Promise<AnalysisResultRow | null> {
  const result = await pool.query(
    `SELECT document_id, user_id, analysis_type, summary,
            phi_detected, entity_count, model_used,
            COALESCE(analysis_status, 'COMPLETE') AS analysis_status
     FROM analysis_results
     WHERE document_id = $1 AND user_id = $2`,
    [documentId, userId]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as AnalysisResultRow;
}

/** Owner or user named on document_shares for this document. */
export async function getAnalysisResultForViewer(
  documentId: string,
  viewerUserId: string
): Promise<AnalysisResultRow | null> {
  const ownerRow = await getAnalysisResult(documentId, viewerUserId);
  if (ownerRow) return ownerRow;

  // Shared viewers only — must not reference document_shares in the owner query:
  // if the shares table was never migrated, the owner path would still 500 otherwise.
  try {
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
    return result.rows[0] as AnalysisResultRow;
  } catch {
    return null;
  }
}

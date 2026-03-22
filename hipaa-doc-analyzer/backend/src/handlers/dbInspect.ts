/**
 * Operational helper: run predefined read-only SQL inside the VPC.
 * Invoke via AWS CLI only (no API Gateway). Restrict invoke with IAM.
 *
 * Payload examples:
 *   {"action":"listAnalysis","limit":20}
 *   {"action":"previewRedacted","documentId":"<uuid>","maxChars":4000}
 */
import { Pool } from 'pg';
import { isUuidString } from '../utils/validators';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl:
    process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
  max: 2
});

function parseEvent(raw: unknown): Record<string, unknown> {
  if (Buffer.isBuffer(raw)) {
    const s = raw.toString('utf8');
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  }
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

export async function handler(event: unknown): Promise<{
  ok: boolean;
  error?: string;
  result?: unknown;
}> {
  const e = parseEvent(event);
  const action = typeof e.action === 'string' ? e.action : '';

  try {
    if (action === 'listAnalysis') {
      const limit = Math.min(100, Math.max(1, parseInt(String(e.limit ?? '25'), 10) || 25));
      const r = await pool.query(
        `SELECT document_id::text,
                analysis_status,
                analysis_type,
                LENGTH(summary) AS summary_chars,
                LENGTH(redacted_document_text) AS redacted_chars
         FROM analysis_results
         ORDER BY created_at DESC NULLS LAST
         LIMIT $1`,
        [limit]
      );
      return { ok: true, result: r.rows };
    }

    if (action === 'previewRedacted') {
      const documentId = typeof e.documentId === 'string' ? e.documentId.trim() : '';
      if (!documentId || !isUuidString(documentId)) {
        return { ok: false, error: 'Invalid or missing documentId (UUID required)' };
      }
      const maxChars = Math.min(100_000, Math.max(100, parseInt(String(e.maxChars ?? '8000'), 10) || 8000));
      const r = await pool.query(
        `SELECT LEFT(redacted_document_text, $2) AS preview,
                LENGTH(redacted_document_text) AS total_chars
         FROM analysis_results
         WHERE document_id = $1`,
        [documentId, maxChars]
      );
      if (r.rows.length === 0) {
        return { ok: false, error: 'No row for document_id' };
      }
      const row = r.rows[0] as { preview: string | null; total_chars: string | null };
      return {
        ok: true,
        result: {
          documentId,
          totalChars: row.total_chars != null ? Number(row.total_chars) : null,
          preview: row.preview ?? null
        }
      };
    }

    return {
      ok: false,
      error:
        'Unknown action. Use {"action":"listAnalysis","limit":25} or {"action":"previewRedacted","documentId":"<uuid>"}'
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('dbInspect error:', msg);
    return { ok: false, error: msg };
  }
}

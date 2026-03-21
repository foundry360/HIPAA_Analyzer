import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { Pool } from 'pg';
import { TokenMap } from '../types';

const kms = new KMSClient({ region: process.env.AWS_REGION });

/** KMS Encrypt plaintext limit per call (bytes) */
const KMS_PLAINTEXT_MAX = 4096;
/** Chunk under limit to leave room for UTF-8 expansion */
const CHUNK_BYTES = 3500;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
  ssl: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
  max: 5
});

function splitUtf8Buffer(buf: Buffer): Buffer[] {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < buf.length) {
    let end = Math.min(offset + CHUNK_BYTES, buf.length);
    if (end < buf.length) {
      while (end > offset && (buf[end] & 0xc0) === 0x80) {
        end--;
      }
      if (end === offset) end = offset + 1;
    }
    chunks.push(buf.subarray(offset, end));
    offset = end;
  }
  return chunks;
}

export async function storeTokenMap(
  documentId: string,
  tokenMap: TokenMap,
  entityCount: number
): Promise<void> {
  const plaintext = JSON.stringify(tokenMap);
  const plaintextBuf = Buffer.from(plaintext, 'utf8');

  let storedPayload: string;

  if (plaintextBuf.length <= KMS_PLAINTEXT_MAX) {
    const encrypted = await kms.send(
      new EncryptCommand({
        KeyId: process.env.KMS_TOKEN_MAP_KEY_ID!,
        Plaintext: plaintextBuf
      })
    );
    storedPayload = Buffer.from(encrypted.CiphertextBlob!).toString('base64');
  } else {
    const parts = splitUtf8Buffer(plaintextBuf);
    const ciphertextB64s: string[] = [];
    for (const part of parts) {
      if (part.length > KMS_PLAINTEXT_MAX) {
        throw new Error('KMS chunk still exceeds limit');
      }
      const encrypted = await kms.send(
        new EncryptCommand({
          KeyId: process.env.KMS_TOKEN_MAP_KEY_ID!,
          Plaintext: part
        })
      );
      ciphertextB64s.push(Buffer.from(encrypted.CiphertextBlob!).toString('base64'));
    }
    storedPayload = JSON.stringify({ v: 2, chunks: ciphertextB64s });
  }

  await pool.query(
    `INSERT INTO phi_token_maps
       (document_id, encrypted_map, entity_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (document_id) DO UPDATE
       SET encrypted_map = $2, entity_count = $3`,
    [documentId, storedPayload, entityCount]
  );
}

export async function retrieveTokenMap(
  documentId: string
): Promise<TokenMap | null> {
  const result = await pool.query(
    `SELECT encrypted_map FROM phi_token_maps
     WHERE document_id = $1 AND expires_at > NOW()`,
    [documentId]
  );

  if (result.rows.length === 0) return null;

  const raw = result.rows[0].encrypted_map as string;

  if (raw.trimStart().startsWith('{')) {
    const parsed = JSON.parse(raw) as { v: number; chunks: string[] };
    if (parsed.v === 2 && Array.isArray(parsed.chunks)) {
      const parts: Buffer[] = [];
      for (const b64 of parsed.chunks) {
        const out = await kms.send(
          new DecryptCommand({ CiphertextBlob: Buffer.from(b64, 'base64') })
        );
        parts.push(Buffer.from(out.Plaintext!));
      }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    }
  }

  const encryptedBuffer = Buffer.from(raw, 'base64');

  const decrypted = await kms.send(
    new DecryptCommand({ CiphertextBlob: encryptedBuffer })
  );
  return JSON.parse(Buffer.from(decrypted.Plaintext!).toString('utf8'));
}

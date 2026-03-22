import { CopyObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

/** S3 CopySource: bucket/key with key URL-encoded except slashes (AWS CopyObject). */
function s3CopySource(bucket: string, key: string): string {
  return `${bucket}/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
}

/**
 * Moves an uploaded clinical document to a new key (same user/doc prefix, new filename segment).
 * Used when the owner renames the saved summary so presigned URLs stay valid.
 */
export async function renameUploadedDocumentObject(
  bucket: string,
  oldKey: string,
  newKey: string
): Promise<void> {
  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: s3CopySource(bucket, oldKey),
        Key: newKey
      })
    );
  } catch (e: unknown) {
    const code = (e as { name?: string; Code?: string })?.name ?? (e as { Code?: string })?.Code;
    console.error('renameUploadedDocumentObject CopyObject:', e);
    if (code === 'NoSuchKey' || code === 'NotFound') {
      throw new Error(
        'Original document file was not found in storage. Rename cannot complete.'
      );
    }
    throw new Error('Could not rename file in storage. Try again.');
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  } catch (delErr) {
    console.error('renameUploadedDocumentObject DeleteObject (orphan copy at new key):', delErr);
    throw new Error('Renamed copy exists but old file could not be removed. Contact support.');
  }
}

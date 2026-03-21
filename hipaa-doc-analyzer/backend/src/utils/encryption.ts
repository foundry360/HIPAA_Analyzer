import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient({ region: process.env.AWS_REGION });

/**
 * Encrypt plaintext with the token-map KMS key.
 * Use for any sensitive payload that must be stored at rest.
 */
export async function encryptWithKms(
  keyId: string,
  plaintext: string
): Promise<string> {
  const command = new EncryptCommand({
    KeyId: keyId,
    Plaintext: Buffer.from(plaintext, 'utf8')
  });
  const response = await kms.send(command);
  return Buffer.from(response.CiphertextBlob!).toString('base64');
}

/**
 * Decrypt KMS ciphertext (base64).
 */
export async function decryptWithKms(
  ciphertextBase64: string
): Promise<string> {
  const buffer = Buffer.from(ciphertextBase64, 'base64');
  const command = new DecryptCommand({ CiphertextBlob: buffer });
  const response = await kms.send(command);
  return Buffer.from(response.Plaintext!).toString('utf8');
}

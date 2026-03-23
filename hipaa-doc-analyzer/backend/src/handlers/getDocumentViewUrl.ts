import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAnalysisResultForViewer } from '../services/auditLog';
import { CORS_HEADERS } from '../utils/cors';
import { getTenantIdFromEvent } from '../utils/tenantContext';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const EXPIRY_SECONDS = parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '900');

function isSafeFileName(name: string): boolean {
  if (!name || name.length > 512) return false;
  if (/[/\\]/.test(name)) return false;
  if (name.includes('..')) return false;
  return true;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const tenantId = getTenantIdFromEvent(event);

    const documentId = event.pathParameters?.documentId;
    const fileName =
      event.queryStringParameters?.fileName ?? event.queryStringParameters?.filename;

    if (!documentId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing documentId' })
      };
    }
    if (!fileName || typeof fileName !== 'string' || !isSafeFileName(fileName)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing or invalid fileName query parameter' })
      };
    }

    const row = await getAnalysisResultForViewer(documentId, userId, tenantId);
    if (!row) {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Document not found' })
      };
    }

    const ownerUserId = row.user_id;
    const s3Key = `uploads/${ownerUserId}/${documentId}/${fileName}`;
    const bucket = process.env.S3_BUCKET_NAME!;

    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
    } catch (headErr: unknown) {
      const code = (headErr as { name?: string; Code?: string })?.name ?? (headErr as { Code?: string })?.Code;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({
            error:
              'Document file is no longer available (it may have expired or been removed from storage).'
          })
        };
      }
      console.error('HeadObject failed:', headErr);
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error:
            'Document file is no longer available (it may have expired or been removed from storage).'
        })
      };
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/"/g, '')}"`
    });

    let url: string;
    try {
      url = await getSignedUrl(s3, command, { expiresIn: EXPIRY_SECONDS });
    } catch (signErr: unknown) {
      console.error('getSignedUrl failed:', signErr);
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Could not create download link. Check S3/KMS permissions for the API Lambda.' })
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        url,
        expiresIn: EXPIRY_SECONDS
      })
    };
  } catch (error) {
    console.error('getDocumentViewUrl error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Could not create document link' })
    };
  }
};

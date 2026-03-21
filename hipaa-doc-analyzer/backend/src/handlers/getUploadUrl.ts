import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { UploadUrlRequest, UploadUrlResponse } from '../types';
import { hasRequiredUploadUrlFields, isAllowedFileType, isValidAnalysisType } from '../utils/validators';
import { CORS_HEADERS } from '../utils/cors';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const EXPIRY_SECONDS = parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '900');

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body = JSON.parse(event.body || '{}') as UploadUrlRequest;

    if (!hasRequiredUploadUrlFields(body) || !isValidAnalysisType(body.analysisType)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (!isAllowedFileType(body.fileType)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'File type not allowed' })
      };
    }

    const documentId = uuidv4();
    const s3Key = `uploads/${userId}/${documentId}/${body.fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      ContentType: body.fileType,
      Tagging: `documentId=${documentId}&userId=${userId}&analysisType=${body.analysisType}`
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: EXPIRY_SECONDS
    });

    const response: UploadUrlResponse = { uploadUrl, documentId, s3Key };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('getUploadUrl error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

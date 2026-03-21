# HIPAA-Compliant Clinical Document Analyzer
## Comprehensive Cursor Build Prompt

---

## PROJECT OVERVIEW

Build a production-ready, HIPAA-compliant clinical document analysis tool on AWS. The application allows authenticated physicians to upload clinical documents (PDFs), automatically redacts all Protected Health Information (PHI) before sending to an AI model, and returns a structured clinical summary. The entire stack runs on AWS under a single Business Associate Agreement (BAA).

---

## TECH STACK

### Frontend
- React 18 (TypeScript)
- AWS Amplify (hosting + CI/CD)
- AWS Cognito (authentication + MFA)
- Tailwind CSS (styling)
- React Query (async state management)

### Backend
- Node.js 20 (AWS Lambda)
- AWS SDK v3 (all AWS service calls)
- AWS S3 (document storage)
- AWS Textract (PDF text extraction)
- AWS Comprehend Medical (PHI detection and redaction)
- Amazon Bedrock — Claude 3.5 Sonnet (AI summarization)
- Amazon RDS PostgreSQL (audit logging + token maps)
- AWS KMS (encryption key management)
- AWS API Gateway (REST API)

### Infrastructure
- AWS CDK v2 (TypeScript) — infrastructure as code
- AWS Amplify CLI — frontend deployment
- GitHub — version control

---

## PROJECT STRUCTURE

Generate the following folder structure exactly:

```
hipaa-doc-analyzer/
├── infrastructure/               # AWS CDK stack
│   ├── bin/
│   │   └── app.ts
│   ├── lib/
│   │   ├── storage-stack.ts      # S3 + KMS
│   │   ├── auth-stack.ts         # Cognito user pool
│   │   ├── database-stack.ts     # RDS PostgreSQL
│   │   ├── api-stack.ts          # API Gateway + Lambda
│   │   └── main-stack.ts         # Root stack
│   ├── cdk.json
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── handlers/
│   │   │   ├── getUploadUrl.ts   # Generate presigned S3 URL
│   │   │   ├── analyzeDocument.ts # Main pipeline orchestrator
│   │   │   └── getResult.ts      # Fetch analysis result
│   │   ├── services/
│   │   │   ├── textract.ts       # PDF text extraction
│   │   │   ├── comprehend.ts     # PHI detection + redaction
│   │   │   ├── bedrock.ts        # LLM summarization
│   │   │   ├── tokenMap.ts       # PHI token storage + retrieval
│   │   │   └── auditLog.ts       # HIPAA audit logging
│   │   ├── utils/
│   │   │   ├── encryption.ts     # KMS encrypt/decrypt helpers
│   │   │   └── validators.ts     # Input validation
│   │   └── types/
│   │       └── index.ts          # Shared TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Auth/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   └── MFASetup.tsx
│   │   │   ├── Upload/
│   │   │   │   ├── DocumentUploader.tsx
│   │   │   │   ├── AnalysisTypeSelector.tsx
│   │   │   │   └── UploadProgress.tsx
│   │   │   ├── Results/
│   │   │   │   ├── SummaryDisplay.tsx
│   │   │   │   └── PHIRedactionBadge.tsx
│   │   │   └── Layout/
│   │   │       ├── Header.tsx
│   │   │       └── ProtectedRoute.tsx
│   │   ├── hooks/
│   │   │   ├── useDocumentUpload.ts
│   │   │   └── useAnalysis.ts
│   │   ├── services/
│   │   │   └── api.ts            # API Gateway client
│   │   ├── config/
│   │   │   └── aws-config.ts     # Amplify + Cognito config
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.ts
│
├── .env.example
├── .gitignore
└── README.md
```

---

## ENVIRONMENT VARIABLES

Create `.env.example` with all required variables:

```bash
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=your-account-id

# S3
S3_BUCKET_NAME=hipaa-doc-analyzer-documents
S3_PRESIGNED_URL_EXPIRY=900  # 15 minutes in seconds

# KMS
KMS_KEY_ID=your-kms-key-id
KMS_TOKEN_MAP_KEY_ID=your-token-map-kms-key-id

# RDS PostgreSQL
DB_HOST=your-rds-endpoint
DB_PORT=5432
DB_NAME=hipaa_analyzer
DB_USER=analyzer_user
DB_PASSWORD=your-secure-password

# Cognito
COGNITO_USER_POOL_ID=your-user-pool-id
COGNITO_CLIENT_ID=your-client-id

# Bedrock
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
BEDROCK_MAX_TOKENS=1500

# API Gateway
API_BASE_URL=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod

# Frontend (Amplify)
VITE_COGNITO_USER_POOL_ID=your-user-pool-id
VITE_COGNITO_CLIENT_ID=your-client-id
VITE_API_BASE_URL=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
VITE_AWS_REGION=us-east-1
```

---

## DATABASE SCHEMA

Create and run this schema on RDS PostgreSQL at setup:

```sql
-- Audit log table — NO PHI stored here
CREATE TABLE audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL,
  user_id               VARCHAR(255) NOT NULL,
  action                VARCHAR(100) NOT NULL,
  phi_entities_detected INTEGER DEFAULT 0,
  phi_types_found       TEXT[],
  model_used            VARCHAR(100),
  analysis_type         VARCHAR(100),
  status                VARCHAR(50) DEFAULT 'SUCCESS',
  error_message         TEXT,
  duration_ms           INTEGER,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- PHI token map table — encrypted, TTL-managed
CREATE TABLE phi_token_maps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL UNIQUE,
  encrypted_map     TEXT NOT NULL,        -- KMS-encrypted JSON
  entity_count      INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  expires_at        TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Analysis results table — summaries only, no PHI
CREATE TABLE analysis_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL UNIQUE,
  user_id         VARCHAR(255) NOT NULL,
  analysis_type   VARCHAR(100) NOT NULL,
  summary         TEXT NOT NULL,
  phi_detected    BOOLEAN DEFAULT FALSE,
  entity_count    INTEGER DEFAULT 0,
  model_used      VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_document_id ON audit_log(document_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_phi_token_maps_expires_at ON phi_token_maps(expires_at);
CREATE INDEX idx_analysis_results_user_id ON analysis_results(user_id);
```

---

## BACKEND — FULL IMPLEMENTATION

### `/backend/src/types/index.ts`

```typescript
export type AnalysisType =
  | 'GENERAL_SUMMARY'
  | 'MEDICATIONS'
  | 'DIAGNOSES'
  | 'FOLLOW_UP_ACTIONS'
  | 'CHIEF_COMPLAINT';

export interface UploadUrlRequest {
  fileName: string;
  fileType: string;
  analysisType: AnalysisType;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  s3Key: string;
}

export interface AnalyzeRequest {
  documentId: string;
  s3Key: string;
  analysisType: AnalysisType;
  userId: string;
}

export interface AnalyzeResponse {
  documentId: string;
  summary: string;
  phiDetected: boolean;
  entitiesRedacted: number;
  analysisType: AnalysisType;
  modelUsed: string;
}

export interface PHIEntity {
  text: string;
  type: string;
  beginOffset: number;
  endOffset: number;
  score: number;
}

export interface TokenMap {
  [token: string]: {
    originalValue: string;
    type: string;
    confidence: number;
  };
}

export interface AuditEntry {
  documentId: string;
  userId: string;
  action: string;
  phiEntitiesDetected: number;
  phiTypesFound: string[];
  modelUsed: string;
  analysisType: string;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  durationMs: number;
}
```

---

### `/backend/src/services/textract.ts`

```typescript
import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  FeatureType
} from '@aws-sdk/client-textract';

const client = new TextractClient({ region: process.env.AWS_REGION });

export async function extractTextFromS3(
  bucket: string,
  key: string
): Promise<string> {
  const command = new AnalyzeDocumentCommand({
    Document: {
      S3Object: { Bucket: bucket, Name: key }
    },
    FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES]
  });

  const response = await client.send(command);

  if (!response.Blocks) {
    throw new Error('Textract returned no blocks');
  }

  // Extract LINE blocks and join into readable text
  const lines = response.Blocks
    .filter(block => block.BlockType === 'LINE' && block.Text)
    .map(block => block.Text!)
    .join('\n');

  if (!lines.trim()) {
    throw new Error('No text extracted from document');
  }

  return lines;
}
```

---

### `/backend/src/services/comprehend.ts`

```typescript
import {
  ComprehendMedicalClient,
  DetectPHICommand
} from '@aws-sdk/client-comprehendmedical';
import { PHIEntity, TokenMap } from '../types';

const client = new ComprehendMedicalClient({ region: process.env.AWS_REGION });

const CONFIDENCE_THRESHOLD = 0.85;
const MAX_TEXT_LENGTH = 20000; // Comprehend Medical limit per call

export async function detectAndRedactPHI(rawText: string): Promise<{
  redactedText: string;
  tokenMap: TokenMap;
  entities: PHIEntity[];
}> {
  // Handle texts longer than the API limit by chunking
  const chunks = chunkText(rawText, MAX_TEXT_LENGTH);
  let allEntities: PHIEntity[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    const chunkEntities = await detectPHIInChunk(chunk);
    // Adjust offsets for position in full text
    const adjustedEntities = chunkEntities.map(e => ({
      ...e,
      beginOffset: e.beginOffset + offset,
      endOffset: e.endOffset + offset
    }));
    allEntities = [...allEntities, ...adjustedEntities];
    offset += chunk.length;
  }

  // Filter to high-confidence detections only
  const highConfidence = allEntities.filter(
    e => e.score >= CONFIDENCE_THRESHOLD
  );

  // Sort by position descending so replacements don't shift offsets
  const sorted = [...highConfidence].sort(
    (a, b) => b.beginOffset - a.beginOffset
  );

  let redactedText = rawText;
  const tokenMap: TokenMap = {};
  let tokenCounter = 1;

  for (const entity of sorted) {
    const token = `[${entity.type}_${tokenCounter}]`;
    tokenMap[token] = {
      originalValue: entity.text,
      type: entity.type,
      confidence: entity.score
    };
    redactedText =
      redactedText.substring(0, entity.beginOffset) +
      token +
      redactedText.substring(entity.endOffset);
    tokenCounter++;
  }

  return { redactedText, tokenMap, entities: highConfidence };
}

async function detectPHIInChunk(text: string): Promise<PHIEntity[]> {
  const command = new DetectPHICommand({ Text: text });
  const response = await client.send(command);

  return (response.Entities || []).map(e => ({
    text: e.Text || '',
    type: e.Type || 'UNKNOWN',
    beginOffset: e.BeginOffset || 0,
    endOffset: e.EndOffset || 0,
    score: e.Score || 0
  }));
}

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    // Try to break at a newline near the limit
    let end = start + maxLength;
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start) end = lastNewline;
    }
    chunks.push(text.substring(start, end));
    start = end;
  }
  return chunks;
}
```

---

### `/backend/src/services/bedrock.ts`

```typescript
import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import { AnalysisType } from '../types';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: `Provide a comprehensive clinical summary including:
1. Chief complaint
2. Key clinical findings
3. Diagnoses or conditions mentioned
4. Current medications referenced
5. Recommended follow-up actions
6. Any critical values or urgent findings`,

  MEDICATIONS: `Extract and summarize all medication information including:
1. Current medications with dosages
2. Medication changes or discontinuations
3. New prescriptions
4. Allergies or adverse reactions noted
5. Medication compliance notes`,

  DIAGNOSES: `Extract and summarize all diagnostic information including:
1. Primary diagnosis
2. Secondary diagnoses or comorbidities
3. Differential diagnoses under consideration
4. Diagnostic test results referenced
5. ICD codes if mentioned`,

  FOLLOW_UP_ACTIONS: `Extract all follow-up actions and care plan items including:
1. Follow-up appointments required
2. Tests or procedures ordered
3. Referrals made
4. Patient education instructions
5. Return precautions`,

  CHIEF_COMPLAINT: `Summarize the chief complaint and presenting symptoms including:
1. Primary reason for visit
2. Symptom onset, duration, and severity
3. Associated symptoms
4. Relevant history related to chief complaint
5. Vital signs if documented`
};

export async function generateClinicalSummary(
  redactedText: string,
  analysisType: AnalysisType
): Promise<string> {
  const analysisInstructions = ANALYSIS_PROMPTS[analysisType];

  const prompt = `You are a clinical documentation specialist analyzing a de-identified medical document.

IMPORTANT INSTRUCTIONS:
- This document has been de-identified. All patient identifiers have been replaced with tokens like [NAME_1], [DATE_1], [ID_1]
- Refer to the patient only as "the patient" — never attempt to reconstruct identifiers
- Focus exclusively on clinical content
- Be concise, accurate, and use clinical terminology
- If information is not present in the document, state "Not documented"
- Do not infer or assume information not explicitly stated

ANALYSIS REQUESTED:
${analysisInstructions}

DOCUMENT:
${redactedText}

Provide your structured clinical analysis:`;

  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '1500'),
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID ||
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody)
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(
    Buffer.from(response.body).toString('utf8')
  );

  if (!responseBody.content?.[0]?.text) {
    throw new Error('Bedrock returned empty response');
  }

  return responseBody.content[0].text;
}
```

---

### `/backend/src/services/tokenMap.ts`

```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import { Pool } from 'pg';
import { TokenMap } from '../types';

const kms = new KMSClient({ region: process.env.AWS_REGION });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: true },
  max: 5
});

export async function storeTokenMap(
  documentId: string,
  tokenMap: TokenMap,
  entityCount: number
): Promise<void> {
  const plaintext = JSON.stringify(tokenMap);

  // Encrypt with KMS before storing
  const encryptCommand = new EncryptCommand({
    KeyId: process.env.KMS_TOKEN_MAP_KEY_ID!,
    Plaintext: Buffer.from(plaintext)
  });

  const encrypted = await kms.send(encryptCommand);
  const encryptedBase64 = Buffer.from(
    encrypted.CiphertextBlob!
  ).toString('base64');

  await pool.query(
    `INSERT INTO phi_token_maps
       (document_id, encrypted_map, entity_count)
     VALUES ($1, $2, $3)
     ON CONFLICT (document_id) DO UPDATE
       SET encrypted_map = $2, entity_count = $3`,
    [documentId, encryptedBase64, entityCount]
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

  const encryptedBuffer = Buffer.from(
    result.rows[0].encrypted_map, 'base64'
  );

  const decryptCommand = new DecryptCommand({
    CiphertextBlob: encryptedBuffer,
    KeyId: process.env.KMS_TOKEN_MAP_KEY_ID!
  });

  const decrypted = await kms.send(decryptCommand);
  return JSON.parse(
    Buffer.from(decrypted.Plaintext!).toString('utf8')
  );
}
```

---

### `/backend/src/services/auditLog.ts`

```typescript
import { Pool } from 'pg';
import { AuditEntry } from '../types';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: true },
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
      summary, phi_detected, entity_count, model_used
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [documentId, userId, analysisType,
      summary, phiDetected, entityCount, modelUsed]
  );
}
```

---

### `/backend/src/handlers/getUploadUrl.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { UploadUrlRequest, UploadUrlResponse } from '../types';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const EXPIRY_SECONDS = parseInt(process.env.S3_PRESIGNED_URL_EXPIRY || '900');

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body: UploadUrlRequest = JSON.parse(event.body || '{}');

    if (!body.fileName || !body.fileType || !body.analysisType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    if (!ALLOWED_TYPES.includes(body.fileType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'File type not allowed' })
      };
    }

    const documentId = uuidv4();
    // Store under user prefix for access isolation
    const s3Key = `uploads/${userId}/${documentId}/${body.fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      ContentType: body.fileType,
      // Tag with metadata for lifecycle management
      Tagging: `documentId=${documentId}&userId=${userId}&analysisType=${body.analysisType}`
    });

    const uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: EXPIRY_SECONDS
    });

    const response: UploadUrlResponse = { uploadUrl, documentId, s3Key };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };
  } catch (error) {
    console.error('getUploadUrl error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

---

### `/backend/src/handlers/analyzeDocument.ts`

```typescript
import { APIGatewayProxyHandler } from 'aws-lambda';
import { extractTextFromS3 } from '../services/textract';
import { detectAndRedactPHI } from '../services/comprehend';
import { generateClinicalSummary } from '../services/bedrock';
import { storeTokenMap } from '../services/tokenMap';
import { writeAuditLog, storeAnalysisResult } from '../services/auditLog';
import { AnalyzeRequest, AnalyzeResponse } from '../types';

export const handler: APIGatewayProxyHandler = async (event) => {
  const startTime = Date.now();
  let documentId = '';
  let userId = '';

  try {
    userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const body: AnalyzeRequest = JSON.parse(event.body || '{}');
    documentId = body.documentId;

    if (!documentId || !body.s3Key || !body.analysisType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // STEP 1: Extract text from document
    console.log(`[${documentId}] Extracting text via Textract`);
    const rawText = await extractTextFromS3(
      process.env.S3_BUCKET_NAME!,
      body.s3Key
    );

    // STEP 2: Detect and redact PHI — CRITICAL HIPAA STEP
    console.log(`[${documentId}] Running Comprehend Medical PHI detection`);
    const { redactedText, tokenMap, entities } =
      await detectAndRedactPHI(rawText);

    console.log(
      `[${documentId}] Detected ${entities.length} PHI entities, redacted`
    );

    // STEP 3: Store encrypted token map
    if (entities.length > 0) {
      await storeTokenMap(documentId, tokenMap, entities.length);
    }

    // STEP 4: Generate AI summary from REDACTED text only
    // PHI never reaches Bedrock
    console.log(`[${documentId}] Sending sanitized text to Bedrock`);
    const summary = await generateClinicalSummary(
      redactedText,
      body.analysisType
    );

    const modelUsed = process.env.BEDROCK_MODEL_ID ||
      'anthropic.claude-3-5-sonnet-20241022-v2:0';

    // STEP 5: Store result
    await storeAnalysisResult(
      documentId, userId, body.analysisType,
      summary, entities.length > 0, entities.length, modelUsed
    );

    // STEP 6: Write HIPAA audit log (no PHI)
    await writeAuditLog({
      documentId,
      userId,
      action: 'DOCUMENT_ANALYSIS',
      phiEntitiesDetected: entities.length,
      phiTypesFound: [...new Set(entities.map(e => e.type))],
      modelUsed,
      analysisType: body.analysisType,
      status: 'SUCCESS',
      durationMs: Date.now() - startTime
    });

    const response: AnalyzeResponse = {
      documentId,
      summary,
      phiDetected: entities.length > 0,
      entitiesRedacted: entities.length,
      analysisType: body.analysisType,
      modelUsed
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };

  } catch (error: any) {
    console.error(`[${documentId}] Pipeline error:`, error);

    // Log failure to audit trail
    if (documentId && userId) {
      await writeAuditLog({
        documentId,
        userId,
        action: 'DOCUMENT_ANALYSIS',
        phiEntitiesDetected: 0,
        phiTypesFound: [],
        modelUsed: process.env.BEDROCK_MODEL_ID || 'unknown',
        analysisType: 'UNKNOWN',
        status: 'ERROR',
        errorMessage: error.message,
        durationMs: Date.now() - startTime
      }).catch(console.error);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Analysis failed. Please try again.' })
    };
  }
};
```

---

## FRONTEND — KEY COMPONENTS

### `/frontend/src/config/aws-config.ts`

```typescript
import { Amplify } from 'aws-amplify';

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      loginWith: {
        email: true
      },
      mfa: {
        status: 'required',        // MFA is mandatory — HIPAA requirement
        totpEnabled: true,
        smsEnabled: true
      },
      passwordFormat: {
        minLength: 12,
        requireNumbers: true,
        requireSpecialCharacters: true,
        requireUppercase: true,
        requireLowercase: true
      }
    }
  }
});
```

---

### `/frontend/src/components/Upload/DocumentUploader.tsx`

```typescript
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDocumentUpload } from '../../hooks/useDocumentUpload';
import { AnalysisTypeSelector } from './AnalysisTypeSelector';
import { AnalysisType } from '../../types';

export function DocumentUploader() {
  const [analysisType, setAnalysisType] =
    useState<AnalysisType>('GENERAL_SUMMARY');
  const { upload, isUploading, isAnalyzing, result, error } =
    useDocumentUpload();

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    await upload(file, analysisType);
  }, [analysisType, upload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB limit
    disabled: isUploading || isAnalyzing
  });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-semibold text-gray-800 mb-2">
        Clinical Document Analyzer
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        PHI is automatically redacted before AI processing.
        All activity is audit-logged.
      </p>

      <AnalysisTypeSelector
        value={analysisType}
        onChange={setAnalysisType}
      />

      <div
        {...getRootProps()}
        className={`mt-4 border-2 border-dashed rounded-lg p-10 text-center
          cursor-pointer transition-colors
          ${isDragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }
          ${(isUploading || isAnalyzing) ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <div className="text-gray-500">
          {isDragActive ? (
            <p>Drop the document here...</p>
          ) : (
            <>
              <p className="text-base font-medium">
                Drop a clinical document here
              </p>
              <p className="text-sm mt-1">
                or click to browse — PDF, JPG, PNG up to 10MB
              </p>
            </>
          )}
        </div>
      </div>

      {(isUploading || isAnalyzing) && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2
              border-blue-500 border-t-transparent rounded-full" />
            <span className="text-sm text-blue-700 font-medium">
              {isUploading
                ? 'Uploading document securely...'
                : 'Redacting PHI and generating summary...'}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-6 p-5 bg-white border border-gray-200
          rounded-lg shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Clinical Summary
            </h2>
            {result.phiDetected && (
              <span className="text-xs px-2 py-1 bg-green-100
                text-green-700 rounded-full font-medium">
                {result.entitiesRedacted} PHI entities redacted
              </span>
            )}
          </div>
          <div className="text-sm text-gray-700 whitespace-pre-wrap
            leading-relaxed">
            {result.summary}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### `/frontend/src/hooks/useDocumentUpload.ts`

```typescript
import { useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { AnalysisType, AnalyzeResponse } from '../types';

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, analysisType: AnalysisType) => {
    setError(null);
    setResult(null);

    try {
      // Get auth token for API calls
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) throw new Error('Not authenticated');

      const apiBase = import.meta.env.VITE_API_BASE_URL;

      // STEP 1: Get presigned upload URL
      setIsUploading(true);
      const urlResponse = await fetch(`${apiBase}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          analysisType
        })
      });

      if (!urlResponse.ok) throw new Error('Failed to get upload URL');
      const { uploadUrl, documentId, s3Key } = await urlResponse.json();

      // STEP 2: Upload directly to S3 (bypasses API Gateway — more secure)
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadResponse.ok) throw new Error('Failed to upload document');
      setIsUploading(false);

      // STEP 3: Trigger analysis pipeline
      setIsAnalyzing(true);
      const analyzeResponse = await fetch(`${apiBase}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ documentId, s3Key, analysisType })
      });

      if (!analyzeResponse.ok) throw new Error('Analysis failed');
      const analysisResult: AnalyzeResponse = await analyzeResponse.json();
      setResult(analysisResult);

    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  return { upload, isUploading, isAnalyzing, result, error };
}
```

---

## AWS CDK INFRASTRUCTURE

### `/infrastructure/lib/main-stack.ts`

```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ─────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'AnalyzerVPC', {
      maxAzs: 2,
      natGateways: 1
    });

    // ── KMS Keys ─────────────────────────────────────────────────
    const documentKey = new kms.Key(this, 'DocumentKey', {
      enableKeyRotation: true,
      description: 'HIPAA - Clinical document encryption key',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const tokenMapKey = new kms.Key(this, 'TokenMapKey', {
      enableKeyRotation: true,
      description: 'HIPAA - PHI token map encryption key',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // ── S3 Bucket ────────────────────────────────────────────────
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      encryptionKey: documentKey,
      encryption: s3.BucketEncryption.KMS,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(90), // Auto-delete after 90 days
        id: 'DeleteOldDocuments'
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // ── Cognito User Pool ────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'PhysicianUserPool', {
      userPoolName: 'hipaa-analyzer-physicians',
      selfSignUpEnabled: false,     // Admin-only user creation
      mfa: cognito.Mfa.REQUIRED,   // HIPAA: MFA mandatory
      mfaSecondFactor: {
        sms: true,
        otp: true
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireSymbols: true,
        requireUppercase: true,
        requireLowercase: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1)
    });

    // ── RDS PostgreSQL ───────────────────────────────────────────
    const dbSecurityGroup = new ec2.SecurityGroup(
      this, 'DBSecurityGroup', { vpc, allowAllOutbound: false }
    );

    const database = new rds.DatabaseInstance(this, 'AuditDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3, ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: documentKey,
      backupRetention: cdk.Duration.days(30), // HIPAA: 30-day backup
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // ── Lambda Functions ─────────────────────────────────────────
    const lambdaEnv = {
      AWS_REGION_NAME: this.region,
      S3_BUCKET_NAME: documentBucket.bucketName,
      KMS_KEY_ID: documentKey.keyId,
      KMS_TOKEN_MAP_KEY_ID: tokenMapKey.keyId,
      BEDROCK_MODEL_ID: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      BEDROCK_MAX_TOKENS: '1500',
      DB_HOST: database.instanceEndpoint.hostname,
      DB_PORT: '5432',
      DB_NAME: 'hipaa_analyzer',
      DB_USER: 'analyzer_user'
    };

    const getUploadUrlFn = new lambda.Function(this, 'GetUploadUrlFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handlers/getUploadUrl.handler',
      code: lambda.Code.fromAsset('../backend/dist'),
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const analyzeDocumentFn = new lambda.Function(
      this, 'AnalyzeDocumentFn', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handlers/analyzeDocument.handler',
        code: lambda.Code.fromAsset('../backend/dist'),
        environment: lambdaEnv,
        vpc,
        timeout: cdk.Duration.minutes(5),  // Textract can be slow on large docs
        memorySize: 512
      }
    );

    // ── Grant Permissions ────────────────────────────────────────
    documentBucket.grantReadWrite(getUploadUrlFn);
    documentBucket.grantRead(analyzeDocumentFn);
    documentKey.grantEncryptDecrypt(getUploadUrlFn);
    documentKey.grantEncryptDecrypt(analyzeDocumentFn);
    tokenMapKey.grantEncryptDecrypt(analyzeDocumentFn);
    database.connections.allowFrom(
      analyzeDocumentFn, ec2.Port.tcp(5432)
    );

    // ── API Gateway ──────────────────────────────────────────────
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this, 'Authorizer', { cognitoUserPools: [userPool] }
    );

    const api = new apigateway.RestApi(this, 'AnalyzerAPI', {
      restApiName: 'hipaa-doc-analyzer',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'GET', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type']
      }
    });

    const authOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    };

    api.root
      .addResource('upload-url')
      .addMethod('POST',
        new apigateway.LambdaIntegration(getUploadUrlFn),
        authOptions
      );

    api.root
      .addResource('analyze')
      .addMethod('POST',
        new apigateway.LambdaIntegration(analyzeDocumentFn),
        authOptions
      );

    // ── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'APIUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId
    });
    new cdk.CfnOutput(this, 'BucketName', {
      value: documentBucket.bucketName
    });
  }
}
```

---

## DEPLOYMENT SEQUENCE

Follow this exact order to deploy:

```bash
# 1. Install dependencies
cd infrastructure && npm install
cd ../backend && npm install
cd ../frontend && npm install

# 2. Build backend TypeScript
cd backend && npm run build

# 3. Deploy AWS infrastructure
cd infrastructure
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
npx cdk deploy

# 4. Copy CDK outputs to .env files
# Update frontend/.env with API URL, User Pool ID, Client ID

# 5. Run database migrations
# Connect to RDS and run schema.sql

# 6. Deploy frontend to Amplify
cd frontend
amplify init
amplify push

# 7. Sign AWS BAA in AWS Console (required before go-live)
# AWS Console → My Account → AWS Artifact → HIPAA BAA

# 8. Manually enable in AWS Console:
# - S3: Block all public access (verify)
# - Cognito: MFA required (verify)
# - KMS: Key rotation enabled (verify)
# - CloudTrail: Enabled in all regions
# - RDS: Deletion protection enabled (verify)
```

---

## HIPAA COMPLIANCE CHECKLIST

```
□ AWS BAA signed in AWS Console before go-live
□ S3 bucket: public access blocked, versioning on, SSE-KMS
□ Cognito: MFA required, strong password policy, no self-signup
□ KMS: key rotation enabled on both keys
□ RDS: storage encrypted, SSL required, deletion protection on
□ Lambda: runs in private VPC subnet
□ API Gateway: all endpoints require Cognito JWT
□ CloudTrail: enabled in us-east-1 (all API calls logged)
□ CloudWatch: Lambda error alarms configured
□ S3 access logs: enabled on document bucket
□ Audit log: confirms no PHI fields are ever written
□ Comprehend Medical: confidence threshold set to 0.85+
□ Bedrock: confirm data not used for training (default off)
□ All secrets in AWS Secrets Manager — never in code
□ Data residency: all resources in us-east-1 only
```

---

## PACKAGE.JSON FILES

### `/backend/package.json`
```json
{
  "name": "hipaa-doc-analyzer-backend",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest"
  },
  "dependencies": {
    "@aws-sdk/client-bedrock-runtime": "^3.0.0",
    "@aws-sdk/client-comprehendmedical": "^3.0.0",
    "@aws-sdk/client-kms": "^3.0.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/client-textract": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0",
    "pg": "^8.11.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/pg": "^8.10.0",
    "@types/uuid": "^9.0.0",
    "typescript": "^5.0.0"
  }
}
```

### `/frontend/package.json`
```json
{
  "name": "hipaa-doc-analyzer-frontend",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "aws-amplify": "^6.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "react-dropzone": "^14.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

---

## CURSOR-SPECIFIC INSTRUCTIONS

When working in Cursor on this project:

1. **Open the full repo as the workspace root** — Cursor needs visibility across all three directories (infrastructure, backend, frontend) for cross-file awareness

2. **Use Cursor Chat for architecture questions** — ask it to explain any AWS SDK method or CDK construct before modifying

3. **Use Cmd+K for inline edits** — ideal for refining the clinical summary prompts in `bedrock.ts` and adjusting the confidence threshold in `comprehend.ts`

4. **Use `.cursorrules` file** at repo root to keep Claude focused:

```
This is a HIPAA-compliant AWS application.
- Never log PHI values anywhere in the codebase
- Always use AWS SDK v3 (not v2)
- All secrets must use process.env — never hardcoded
- Comprehend Medical must run before any Bedrock call
- TypeScript strict mode is required throughout
- All Lambda handlers must include audit log writes
```

5. **Test the PHI redaction first** before building the UI — run `comprehend.ts` against a sample clinical document and verify entities are caught before proceeding

---

*Generated by Foundry360 | HIPAA-Compliant Clinical Document Analyzer v1.0*

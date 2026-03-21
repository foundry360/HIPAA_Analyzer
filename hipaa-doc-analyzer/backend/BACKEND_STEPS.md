# Backend — Step-by-Step

Build in this order so each step has its dependencies in place.

---

## Step 1: TypeScript config

Add `tsconfig.json` so the backend compiles for Node 20 and Lambda finds handlers under `dist/`.

**Deliverable:** `backend/tsconfig.json`

---

## Step 2: Shared types

Define request/response and domain types used by services and handlers.

**Deliverable:** `backend/src/types/index.ts`

**Contains:** `AnalysisType`, `UploadUrlRequest/Response`, `AnalyzeRequest/Response`, `PHIEntity`, `TokenMap`, `AuditEntry`

---

## Step 3: Services

Implement the pipeline pieces. No circular deps; order below is safe.

1. **textract.ts** — Extract text from PDF/image in S3 via AWS Textract.
2. **comprehend.ts** — Detect PHI with Comprehend Medical, redact and build token map.
3. **bedrock.ts** — Call Claude on Bedrock with analysis-type-specific prompts.
4. **tokenMap.ts** — Store/retrieve KMS-encrypted token map in RDS.
5. **auditLog.ts** — Write audit log and analysis result rows to RDS (no PHI).

**Deliverables:**  
`backend/src/services/textract.ts`  
`backend/src/services/comprehend.ts`  
`backend/src/services/bedrock.ts`  
`backend/src/services/tokenMap.ts`  
`backend/src/services/auditLog.ts`

---

## Step 4: Utils (optional but recommended)

- **validators.ts** — Validate `AnalysisType`, file type, required fields.
- **encryption.ts** — Thin KMS encrypt/decrypt helpers if you want a single place for key usage.

**Deliverables:**  
`backend/src/utils/validators.ts`  
`backend/src/utils/encryption.ts`

---

## Step 5: Lambda handlers

Wire the API to the services.

1. **getUploadUrl.ts** — Validate request, generate presigned S3 PUT URL, return `documentId` + `s3Key`.
2. **analyzeDocument.ts** — Run pipeline: Textract → Comprehend (redact) → store token map → Bedrock → store result + audit log; return summary response.
3. **getResult.ts** — Load analysis result by `documentId` + `userId` from RDS; return same shape as analyze response (for polling or refresh).

**Deliverables:**  
`backend/src/handlers/getUploadUrl.ts`  
`backend/src/handlers/analyzeDocument.ts`  
`backend/src/handlers/getResult.ts`

---

## Step 6: Build and verify

```bash
cd backend
npm install
npm run build
```

Confirm `dist/` contains `handlers/*.js`, `services/*.js`, `types/index.js`, and that infrastructure can point Lambda `handler` to `handlers/getUploadUrl.handler` (and similarly for the others).

---

## Step 7: Deploy (finish backend)

See **DEPLOY.md** at the repo root:

1. Deploy CDK stack from `infrastructure/` (Lambdas, API Gateway, S3, RDS, Cognito, KMS).
2. Run `backend/schema.sql` on RDS.
3. Set `DB_PASSWORD` (via CDK context or Lambda env) so Lambdas can connect.
4. Smoke-test: upload-url → upload to S3 → analyze → get result.

---

## Dependency overview

```
types (step 2)
  ↑
services: textract, comprehend, bedrock, tokenMap, auditLog (step 3)
  ↑
utils: validators, encryption (step 4)
  ↑
handlers: getUploadUrl, analyzeDocument, getResult (step 5)
```

---

## Environment

Handlers and services expect (from Lambda env or .env when running locally):

- `AWS_REGION`
- `S3_BUCKET_NAME`, `S3_PRESIGNED_URL_EXPIRY`
- `KMS_TOKEN_MAP_KEY_ID`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `BEDROCK_MODEL_ID`, `BEDROCK_MAX_TOKENS`

No secrets in code; use `process.env` only.

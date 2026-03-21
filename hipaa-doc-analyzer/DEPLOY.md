# Backend deployment

Get the backend from “built” to “callable API” in this order.

## 0. First-time AWS setup (after creating an account)

1. **Install and configure the AWS CLI** so CDK and the app use your account:
   - Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html).
   - Run `aws configure` and enter your **Access Key ID**, **Secret Access Key**, and default **region** (e.g. `us-east-1`).
   - Verify: `aws sts get-caller-identity` (shows Account, UserId, Arn).

2. **Choose a region** and use it consistently (e.g. `us-east-1`). Bedrock, Textract, and Comprehend Medical must be available in that region.

3. **Enable Bedrock model access** (needed for the analyze pipeline):
   - In AWS Console → Amazon Bedrock → Model access (or Get started).
   - Request access to **Claude 3.5 Sonnet** (or the model ID in your stack).

4. **Node.js 20** must be installed for the backend and CDK.

## 1. Build backend

```bash
cd backend
npm install
npm run build
```

Ensures `backend/dist` exists with compiled handlers (used by CDK).

## 2. Deploy infrastructure (CDK)

```bash
cd infrastructure
npm install
npx cdk bootstrap aws://YOUR_ACCOUNT_ID/us-east-1   # once per account/region
npx cdk deploy
```

- **DB password:** Set via context or env so Lambdas can connect to RDS:
  - `cdk deploy -c dbPassword=YOUR_SECURE_PASSWORD`, or
  - `export DB_PASSWORD=...` before `cdk deploy`
  - For production, use AWS Secrets Manager and pass the secret ARN (backend would need to resolve it at runtime).

After deploy, note the outputs: **APIUrl**, **UserPoolId**, **UserPoolClientId**, **BucketName**.

**When stack is CREATE_COMPLETE**, get outputs:

```bash
aws cloudformation describe-stacks --stack-name HipaaDocAnalyzerStack --query 'Stacks[0].Outputs' --output table
```

## 3. Database setup

1. **RDS endpoint:** AWS Console → RDS → Databases → your instance (e.g. `AuditDatabase...`) → copy **Endpoint**.
2. **Master password:** AWS Console → Secrets Manager → find the secret for the RDS instance (name contains the instance id) → Retrieve secret value; note **username** (often `postgres` or admin) and **password**.
3. **Allow your IP (temporary):** RDS → your instance → under **Security**, open the **VPC security group** → Edit inbound rules → Add: Type **PostgreSQL**, Port **5432**, Source **My IP** → Save.
4. **Create DB and app user** (password = same as you passed to `cdk deploy -c dbPassword=...`, e.g. `HipaaAnalyzerDev123!`):

```bash
psql -h YOUR_RDS_ENDPOINT -U postgres -d postgres
```

In `psql`:

```sql
CREATE DATABASE hipaa_analyzer;
\c hipaa_analyzer
CREATE USER analyzer_user WITH PASSWORD 'HipaaAnalyzerDev123!';
GRANT ALL PRIVILEGES ON DATABASE hipaa_analyzer TO analyzer_user;
\c hipaa_analyzer analyzer_user
```

Then exit (`\q`) and run the schema from your machine:

```bash
psql -h YOUR_RDS_ENDPOINT -U analyzer_user -d hipaa_analyzer -f backend/schema.sql
```

(Optional: remove the "My IP" rule from the RDS security group when done.)

## 4. API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload-url` | Get presigned S3 upload URL (body: `fileName`, `fileType`, `analysisType`) |
| POST | `/analyze` | Run pipeline: Textract → PHI redaction → Bedrock → store result (body: `documentId`, `s3Key`, `analysisType`) |
| GET | `/result/{documentId}` | Fetch analysis result for a document (path param: `documentId`) |

All require **Cognito JWT** in the `Authorization: Bearer <token>` header.

## 5. Smoke test

1. Create a user in Cognito (e.g. AWS Console → Cognito → User Pools → your pool → Create user).
2. Sign in (or use AWS CLI / Postman) to get an ID token.
3. `POST {APIUrl}upload-url` with body and `Authorization: Bearer <token>` → expect 200 and `uploadUrl`, `documentId`, `s3Key`.
4. Upload a small PDF to `uploadUrl` with a PUT request.
5. `POST {APIUrl}analyze` with `documentId`, `s3Key`, `analysisType` → expect 200 and a summary (or 500 if Bedrock/Textract/Comprehend not enabled in your account).
6. `GET {APIUrl}result/{documentId}` → expect 200 and the same result payload.

### Primary administrator (Manage users)

The **primary** admin is stored in Postgres (`app_config.key = 'primary_admin_sub'`). It is **not** auto-selected from “earliest Cognito user” (that incorrectly made new invitees the primary).

**First-time bootstrap** when that row is missing: pass **`PRIMARY_ADMIN_EMAIL`** (full email; user must exist in Cognito) or **`PRIMARY_ADMIN_SUB`** (Cognito `sub`) via CDK context or environment on deploy. Optional break-glass: **`ADMIN_EMAILS`** / **`ADMIN_USERNAMES`**.

**Fix a wrong primary** (replace with the real admin’s `sub` from Cognito):

```sql
UPDATE app_config SET value = '<cognito_sub>' WHERE key = 'primary_admin_sub';
```

New users invited from Manage users are **regular users** unless you enable **Also assign delegated administrator role** on invite, or add them under “Add administrator” afterward.

## 6. Frontend env

When building the frontend, set:

- `VITE_COGNITO_USER_POOL_ID` = UserPoolId output  
- `VITE_COGNITO_CLIENT_ID` = UserPoolClientId output  
- `VITE_API_BASE_URL` = APIUrl output (no trailing slash)  
- `VITE_AWS_REGION` = e.g. `us-east-1`

### Deploy UI to S3 (included in CDK stack)

After `cdk deploy`, CloudFormation outputs **`FrontendWebsiteURL`** (S3 static website). The stack runs **`BucketDeployment`** from `frontend/dist`, so **build the SPA first**, then deploy:

```bash
cd frontend && npm install && npm run build
cd ../infrastructure && npm run deploy:frontend
```

(`deploy:frontend` runs build + `cdk deploy`; `DB_PASSWORD` or `-c dbPassword=...` must still be set as for any CDK deploy.)

## Notes

- **Lambda env:** Stack sets `AWS_REGION`, `S3_BUCKET_NAME`, `S3_PRESIGNED_URL_EXPIRY`, `KMS_*`, `DB_*`, `BEDROCK_*`. Backend reads these via `process.env`.
- **RDS:** Lambdas run in the same VPC as RDS and are allowed on port 5432. Ensure the DB security group allows ingress from the Lambda security group (CDK does this via `database.connections.allowFrom(...)`).
- **HIPAA:** Sign the AWS BAA and verify the checklist (S3, Cognito MFA, KMS rotation, CloudTrail, etc.) before go-live.

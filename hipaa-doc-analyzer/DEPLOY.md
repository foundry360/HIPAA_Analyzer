# Backend deployment

Get the backend from “built” to “callable API” in this order.

**Quick reference (PDF):** `docs/DEPLOY-CHEAT-SHEET.pdf` (source: `docs/DEPLOY-CHEAT-SHEET.md`; regenerate with `python3 docs/generate-cheat-sheet-pdf.py` from `hipaa-doc-analyzer`, requires `fpdf2`).

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

- **DB password (required):** Lambdas use `DB_USER=analyzer_user` and `DB_PASSWORD` from CDK. Set **one** of:
  - `export DB_PASSWORD=YOUR_SECURE_PASSWORD` then `cdk deploy` (recommended for `npm run deploy:frontend`), or
  - `cdk deploy -c dbPassword=YOUR_SECURE_PASSWORD`
- **Same password everywhere:** The value must match the password RunDbSetup applies to `analyzer_user` in Postgres. If they drift, you get **“Database login failed for analyzer_user”** (HTTP 503 on saved-summaries, etc.). Fix: deploy again with the intended `DB_PASSWORD`, then **invoke RunDbSetup once** (see §3).
- For production, consider storing the app user password in Secrets Manager and wiring Lambdas to read it at runtime (today the stack passes plain env at deploy time).

After deploy, note the outputs: **APIUrl**, **UserPoolId**, **UserPoolClientId**, **BucketName**, **RunDbSetupFunctionName**.

**When stack is CREATE_COMPLETE**, get outputs:

```bash
aws cloudformation describe-stacks --stack-name HipaaDocAnalyzerStack --query 'Stacks[0].Outputs' --output table
```

## 2b. Multi-tenant database migration (existing deployments)

If the stack already existed before multi-tenant support, run **`backend/migrations/002_multi_tenant.sql`** against `hipaa_analyzer` (after backup). It creates `tenants`, adds `tenant_id` columns, and backfills the default tenant UUID `00000000-0000-4000-8000-000000000001`. New installs can rely on **RunDbSetup** alone, which applies the same changes.

After deploy, **Cognito** includes a mutable custom attribute **`custom:tenant_id`** (UUID). Existing users do not have it until you set it (e.g. `aws cognito-idp admin-update-user-attributes` with `custom:tenant_id` = the default tenant UUID). Until then, Lambdas use **`DEFAULT_TENANT_ID`** from the environment for API requests without that claim.

### New tenant + first user (one command)

After deploy, stack output **`TenantBootstrapFunctionName`** names a Lambda that inserts a row into **`tenants`** and creates a Cognito user with **`custom:tenant_id`** set to that new tenant UUID (invite email with temporary password, same as admin “invite user”).

From the **`hipaa-doc-analyzer`** directory:

```bash
./scripts/bootstrap-tenant.sh "Organization display name" "first.user@example.com"
```

Optional: `./scripts/bootstrap-tenant.sh "Org" "user@example.com" --no-admin` to skip granting delegated admin (default tries if a **primary** admin exists in `app_config` / deploy env). Requires **jq** and AWS CLI credentials with permission to **invoke** that Lambda.

## 3. Database setup (RunDbSetup — recommended)

Lambdas cannot reach RDS from your laptop; the stack includes **RunDbSetupFn**, which runs in the VPC, creates `hipaa_analyzer` and `analyzer_user`, and applies schema. It uses **the same `DB_PASSWORD`** you passed at CDK deploy time.

**After each deploy** where you introduced a **new** database or **changed** `DB_PASSWORD`, invoke it once:

```bash
# Name from CloudFormation output RunDbSetupFunctionName, or:
aws lambda list-functions --region YOUR_REGION --query "Functions[?contains(FunctionName, 'RunDbSetup')].FunctionName" --output text

aws lambda invoke --function-name "PASTE_RunDbSetup_FUNCTION_NAME" --region YOUR_REGION --cli-binary-format raw-in-base64-out /tmp/db-setup-out.json
cat /tmp/db-setup-out.json
```

Expect a JSON body with success; check CloudWatch logs if it fails.

**If you see “Database login failed for analyzer_user” in the app:** Postgres still has an old password for `analyzer_user`, or RunDbSetup never ran. Align by:

1. `export DB_PASSWORD='the-password-you-want'` (must be non-empty)
2. `cd infrastructure && npx cdk deploy` (or `npm run deploy:frontend`)
3. Invoke **RunDbSetup** again (it runs `ALTER USER analyzer_user` when the user already exists).

### Alternative: manual `psql` from your machine

Only if you open the RDS security group to your IP. Use the **same** password as `DB_PASSWORD` / `dbPassword` for `analyzer_user`. See `backend/DATABASE-SETUP.md` and `backend/schema.sql`.

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

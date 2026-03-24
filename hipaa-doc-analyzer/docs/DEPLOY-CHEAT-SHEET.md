# HIPAA Doc Analyzer — deployment cheat sheet

*Operational reference for deploying the platform and onboarding tenant customers. See `DEPLOY.md` in this repo for full detail.*

---

## Prerequisites (once per AWS account / operator machine)

- AWS CLI v2 configured (`aws sts get-caller-identity`)
- Node.js 20
- Fixed AWS region (e.g. `us-east-1`) — Bedrock, Textract, Comprehend Medical must be available
- Bedrock model access enabled for the model configured in the stack
- For CDK: run commands from **`hipaa-doc-analyzer/infrastructure`** (where `cdk.json` lives)

---

## A. Deploy or update the stack

| Step | Action |
|------|--------|
| 1 | `cd hipaa-doc-analyzer/backend && npm install && npm run build` |
| 2 | `cd ../infrastructure && npm install` |
| 3 | **`export DB_PASSWORD='your-secure-password'`** (required — same value used for DB user sync below) |
| 4 | `npx cdk deploy` (or `npx cdk deploy -c dbPassword='your-secure-password'`) |
| 5 | Invoke **RunDbSetup** Lambda once (output `RunDbSetupFunctionName`). Repeat after **every** deploy that changes `DB_PASSWORD` or creates a new database. |
| 6 | Build and publish UI: `cd ../frontend && npm install && npm run build` then `cd ../infrastructure && npm run deploy:frontend` (with `DB_PASSWORD` set). |

**Save CloudFormation outputs:** `APIUrl`, `UserPoolId`, `UserPoolClientId`, `FrontendWebsiteURL`, `RunDbSetupFunctionName`, `TenantBootstrapFunctionName`.

**Password rule:** `DB_PASSWORD` at deploy = password Lambdas use = password RunDbSetup applies to `analyzer_user`. If they drift → database login failures (e.g. HTTP 503, Postgres `28P01`).

---

## B. Onboard a new tenant customer (existing stack)

| Step | Action |
|------|--------|
| 1 | Create tenant + first user: from `hipaa-doc-analyzer`, run `./scripts/bootstrap-tenant.sh "Organization name" "first.user@example.com"` (requires `jq`, AWS credentials with Lambda invoke permission). Or invoke **TenantBootstrap** Lambda with JSON: `tenantName`, `email`, optional `makeAdmin`. |
| 2 | First user completes Cognito invite (temporary password, MFA per pool policy). |
| 3 | Additional users: use in-app **Manage users** (invites inherit inviter’s `custom:tenant_id`) or set **`custom:tenant_id`** in Cognito to the tenant UUID. |
| 4 | Primary administrator is stored in Postgres (`app_config.primary_admin_sub`). Bootstrap via `PRIMARY_ADMIN_EMAIL` / `PRIMARY_ADMIN_SUB` on deploy if needed. |

**Default tenant UUID** (legacy / single-org): `00000000-0000-4000-8000-000000000001`.

---

## C. Command snippets (region `us-east-1`, stack `HipaaDocAnalyzerStack`)

**All stack outputs**

```text
aws cloudformation describe-stacks --stack-name HipaaDocAnalyzerStack --region us-east-1 \
  --query 'Stacks[0].Outputs' --output table
```

**RunDbSetup**

```text
aws lambda invoke --function-name "$(aws cloudformation describe-stacks --stack-name HipaaDocAnalyzerStack --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`RunDbSetupFunctionName`].OutputValue' --output text)" \
  --region us-east-1 --cli-binary-format raw-in-base64-out /tmp/db-setup-out.json && cat /tmp/db-setup-out.json
```

**TenantBootstrap (new org + first user)**

```text
aws lambda invoke \
  --function-name "$(aws cloudformation describe-stacks --stack-name HipaaDocAnalyzerStack --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`TenantBootstrapFunctionName`].OutputValue' --output text)" \
  --region us-east-1 --cli-binary-format raw-in-base64-out \
  --payload '{"tenantName":"Organization Name","email":"user@example.com","makeAdmin":true}' \
  /tmp/tenant-bootstrap-out.json && cat /tmp/tenant-bootstrap-out.json
```

---

## D. Frontend environment (per build)

Set when building the SPA:

- `VITE_COGNITO_USER_POOL_ID` = UserPoolId output  
- `VITE_COGNITO_CLIENT_ID` = UserPoolClientId output  
- `VITE_API_BASE_URL` = APIUrl (no trailing slash)  
- `VITE_AWS_REGION` = e.g. `us-east-1`

Single stack + multi-tenant: one UI build; isolation is by **`custom:tenant_id`**.

---

## E. Compliance note

Before production use with PHI: AWS BAA, MFA, encryption, audit logging, and your organizational HIPAA checklist. This sheet is operational only, not legal advice.

# Database setup (run after CDK deploy)

RDS is in a **private subnet**, so you cannot connect from your laptop with `psql` unless you use a bastion. Use **Option A** (Lambda) to run the schema with no extra network setup.

---

## Option A – Run the schema via Lambda (recommended)

A Lambda **RunDbSetupFn** runs inside the VPC and creates the database, user, and tables.

1. **Deploy the stack** (if you haven’t already):
   ```bash
   cd hipaa-doc-analyzer/backend && npm run build
   cd ../infrastructure
   npx cdk deploy -c dbPassword='HipaaAnalyzerDev123!' --require-approval never
   ```

2. **Get the function name** from the stack outputs (e.g. **RunDbSetupFunctionName**), or list it:
   ```bash
   aws lambda list-functions --region us-east-1 --query "Functions[?contains(FunctionName, 'RunDbSetup')].FunctionName" --output text
   ```

3. **Invoke the Lambda once**:
   ```bash
   aws lambda invoke --function-name HipaaDocAnalyzerStack-RunDbSetupFnXXXX --region us-east-1 --log-type Tail out.json
   cat out.json
   ```
   Replace the function name with the one from step 2. If successful, `out.json` contains `{"statusCode":200,"body":"{\"message\":\"Database setup complete\"}"}`.

4. If you see **role already exists** or **database already exists**, the setup was done earlier; the Lambda is idempotent for those steps. You can still run it again.

---

## Option B – psql from your Mac (only if RDS is publicly accessible)

If you later make RDS publicly accessible (or use a bastion), you can run the SQL files manually.

**Ensure `psql` is on your PATH** (new terminals may not have it):
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
psql --version
```

Then use the endpoint and secret from the stack:

- **RDS endpoint:** AWS Console → RDS → your instance → **Endpoint**
- **Master password:** Secrets Manager → secret for the RDS instance → **Retrieve secret value**

```bash
cd hipaa-doc-analyzer
psql -h YOUR_RDS_ENDPOINT -U postgres -d postgres -f backend/setup-db.sql
PGPASSWORD='HipaaAnalyzerDev123!' psql -h YOUR_RDS_ENDPOINT -U analyzer_user -d hipaa_analyzer -f backend/schema.sql
```

---

## After setup

Your Lambdas use **DB_USER=analyzer_user** and **DB_PASSWORD** (the value you passed to `cdk deploy -c dbPassword=...`). No further DB steps are required for the API.

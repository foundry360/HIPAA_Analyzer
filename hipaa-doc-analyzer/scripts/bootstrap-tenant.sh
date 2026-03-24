#!/usr/bin/env bash
# Create a new tenant (Postgres row) and the first Cognito user with custom:tenant_id.
# Requires: AWS CLI, jq, and IAM permission to invoke the TenantBootstrap Lambda.
#
# Usage:
#   ./scripts/bootstrap-tenant.sh "Acme Clinic" "admin@acme.com"
#   ./scripts/bootstrap-tenant.sh "Acme Clinic" "admin@acme.com" --no-admin
#
# Env:
#   AWS_REGION (default: us-east-1)
#   HIPAA_STACK_NAME (default: HipaaDocAnalyzerStack) — used to resolve the Lambda name
#   TENANT_BOOTSTRAP_FN — optional; full Lambda function name if you do not use CloudFormation lookup

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
STACK="${HIPAA_STACK_NAME:-HipaaDocAnalyzerStack}"

usage() {
  echo "Usage: $0 <tenant_name> <email> [--no-admin]" >&2
  echo "  --no-admin  Skip delegated-admin grant (default: grant if a primary admin exists)" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage
TENANT_NAME="$1"
EMAIL="$2"
shift 2
MAKE_ADMIN="true"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-admin) MAKE_ADMIN="false" ;;
    *) usage ;;
  esac
  shift
done

if ! command -v jq &>/dev/null; then
  echo "jq is required (e.g. brew install jq)" >&2
  exit 1
fi

FN="${TENANT_BOOTSTRAP_FN:-}"
if [[ -z "$FN" ]]; then
  FN=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='TenantBootstrapFunctionName'].OutputValue" --output text 2>/dev/null || true)
fi

if [[ -z "$FN" || "$FN" == "None" ]]; then
  echo "Could not resolve TenantBootstrapFunctionName. Deploy the stack or set TENANT_BOOTSTRAP_FN." >&2
  exit 1
fi

if [[ "$MAKE_ADMIN" == "true" ]]; then
  PAYLOAD=$(jq -n --arg name "$TENANT_NAME" --arg email "$EMAIL" '{tenantName:$name, email:$email, makeAdmin:true}')
else
  PAYLOAD=$(jq -n --arg name "$TENANT_NAME" --arg email "$EMAIL" '{tenantName:$name, email:$email, makeAdmin:false}')
fi

OUT="$(mktemp "${TMPDIR:-/tmp}/tenant-bootstrap.XXXXXX.json")"

aws lambda invoke --function-name "$FN" --region "$REGION" \
  --cli-binary-format raw-in-base64-out \
  --payload "$PAYLOAD" \
  "$OUT"

cat "$OUT"
echo ""

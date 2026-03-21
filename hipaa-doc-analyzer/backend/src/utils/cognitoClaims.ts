import type { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Cognito `sub` from API Gateway. Some integrations pass `claims` as a JSON string instead of an object.
 */
export function getCognitoSubFromEvent(event: APIGatewayProxyEvent): string | undefined {
  const auth = event.requestContext.authorizer as Record<string, unknown> | undefined;
  if (!auth) return undefined;
  const raw = auth.claims;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { sub?: unknown };
      return typeof parsed.sub === 'string' ? parsed.sub : undefined;
    } catch {
      return undefined;
    }
  }
  if (raw && typeof raw === 'object') {
    const sub = (raw as Record<string, unknown>).sub;
    return typeof sub === 'string' ? sub : undefined;
  }
  return undefined;
}

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { isUuidString } from './validators';

/**
 * Stable default tenant for legacy rows and users without custom:tenant_id yet.
 * Must match DEFAULT_TENANT_ID in CDK and migrations.
 */
export const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || '00000000-0000-4000-8000-000000000001';

function claimsFromAuthorizer(auth: Record<string, unknown>): Record<string, string> | undefined {
  const jwt = auth.jwt;
  if (jwt && typeof jwt === 'object') {
    const c = (jwt as Record<string, unknown>).claims;
    if (c && typeof c === 'object' && !Array.isArray(c)) return c as Record<string, string>;
  }
  const raw = auth.claims;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return undefined;
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, string>;
  return undefined;
}

/** Cognito ID token claims from API Gateway (REST). */
export function getAuthorizerClaims(
  event: APIGatewayProxyEvent
): Record<string, string> | undefined {
  const auth = event.requestContext?.authorizer as Record<string, unknown> | undefined;
  if (!auth) return undefined;
  return claimsFromAuthorizer(auth);
}

/** Tenant UUID from custom:tenant_id, or DEFAULT_TENANT_ID if missing/invalid. */
export function getTenantIdFromEvent(event: APIGatewayProxyEvent): string {
  const claims = getAuthorizerClaims(event);
  const tid = claims?.['custom:tenant_id'];
  if (typeof tid === 'string' && isUuidString(tid.trim())) return tid.trim();
  return DEFAULT_TENANT_ID;
}

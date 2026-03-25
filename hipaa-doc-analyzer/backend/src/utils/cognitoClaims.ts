import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getAuthorizerClaims } from './tenantContext';

function subFromClaimsObject(claims: unknown): string | undefined {
  if (!claims || typeof claims !== 'object') return undefined;
  const sub = (claims as Record<string, unknown>).sub;
  return typeof sub === 'string' ? sub : undefined;
}

/**
 * Cognito `sub` from API Gateway. REST API may pass `claims` as object or JSON string;
 * HTTP API (JWT) uses `authorizer.jwt.claims`.
 */
export function getCognitoSubFromEvent(event: APIGatewayProxyEvent): string | undefined {
  /** Console tests and some invocations omit `requestContext` (no API Gateway). */
  const auth = event.requestContext?.authorizer as Record<string, unknown> | undefined;
  if (!auth) return undefined;

  const jwt = auth.jwt;
  if (jwt && typeof jwt === 'object') {
    const fromJwt = subFromClaimsObject((jwt as Record<string, unknown>).claims);
    if (fromJwt) return fromJwt;
  }

  const raw = auth.claims;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as { sub?: unknown };
      return typeof parsed.sub === 'string' ? parsed.sub : undefined;
    } catch {
      return undefined;
    }
  }
  return subFromClaimsObject(raw);
}

/** Email from Cognito ID token (API Gateway authorizer). */
export function getEmailFromEvent(event: APIGatewayProxyEvent): string | undefined {
  const c = getAuthorizerClaims(event);
  const e = c?.email ?? c?.['email'];
  return typeof e === 'string' && e.includes('@') ? e.trim().toLowerCase() : undefined;
}

export function getCognitoUsernameFromEvent(event: APIGatewayProxyEvent): string | undefined {
  const c = getAuthorizerClaims(event);
  const u =
    c?.['cognito:username'] ?? c?.username ?? c?.preferred_username ?? c?.['cognito_username'];
  return typeof u === 'string' ? u : undefined;
}

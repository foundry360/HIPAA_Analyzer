/**
 * API Gateway base URL. In dev, set VITE_DEV_API_PROXY=true to route via Vite’s /dev-api proxy
 * (same-origin) so the browser does not block cross-origin responses (e.g. missing CORS on 404).
 */
export function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('API URL not configured');
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_API_PROXY === 'true') {
    return '/dev-api';
  }
  return base;
}

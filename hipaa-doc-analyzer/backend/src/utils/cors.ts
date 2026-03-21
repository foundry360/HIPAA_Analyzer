/** CORS headers for API Gateway Lambda responses (browser requests from localhost or any origin) */
export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

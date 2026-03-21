import { Amplify } from 'aws-amplify';

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '';
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';

if (!userPoolId || !userPoolClientId) {
  console.warn('Missing VITE_COGNITO_USER_POOL_ID or VITE_COGNITO_CLIENT_ID');
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: {
        email: true,
        username: true
      },
      passwordFormat: {
        minLength: 12,
        requireNumbers: true,
        requireSpecialCharacters: true,
        requireUppercase: true,
        requireLowercase: true
      }
    }
  }
});

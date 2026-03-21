# Clinical Document Analyzer — Frontend

React 18 + TypeScript + Vite + Tailwind. Auth via AWS Amplify (Cognito + MFA). Calls the deployed API for upload-url, upload to S3, and analyze.

## Setup

1. Copy `.env.example` to `.env` and set:
   - `VITE_API_BASE_URL` — API Gateway base URL (e.g. `https://xxx.execute-api.us-east-1.amazonaws.com/prod`)
   - `VITE_COGNITO_USER_POOL_ID` — Cognito User Pool ID
   - `VITE_COGNITO_CLIENT_ID` — Cognito App Client ID

   Or use the values from your CDK stack outputs (same as smoke test).

2. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:5173. Sign in with your Cognito user (username + password), complete MFA if prompted, then upload a PDF and choose an analysis type.

## Build

```bash
npm run build
```

Output is in `dist/`. For Amplify hosting, connect the repo and set the same env vars in the Amplify console.

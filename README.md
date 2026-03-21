# HIPAA Document Analyzer

Clinical document analysis stack: React frontend, AWS Lambda backend, API Gateway, Cognito, RDS, Textract, Comprehend Medical, and Bedrock.

## Layout

- `hipaa-doc-analyzer/frontend` — Vite + React app
- `hipaa-doc-analyzer/backend` — Lambda handlers and services
- `hipaa-doc-analyzer/infrastructure` — AWS CDK

See `hipaa-doc-analyzer/DEPLOY.md` for deployment.

## Quick start (local UI)

```bash
cd hipaa-doc-analyzer/frontend
cp .env.example .env   # fill in API URL and Cognito IDs
npm install && npm run dev
```

Open http://localhost:5173

## License

Proprietary — [foundry360](https://github.com/foundry360)

-- Run this as the RDS master user (postgres) after connecting to database "postgres".
-- Replace the password below with the same one you used for: cdk deploy -c dbPassword=...

CREATE DATABASE hipaa_analyzer;

\c hipaa_analyzer

CREATE USER analyzer_user WITH PASSWORD 'HipaaAnalyzerDev123!';

GRANT ALL PRIVILEGES ON DATABASE hipaa_analyzer TO analyzer_user;

GRANT ALL ON SCHEMA public TO analyzer_user;

GRANT CREATE ON SCHEMA public TO analyzer_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO analyzer_user;

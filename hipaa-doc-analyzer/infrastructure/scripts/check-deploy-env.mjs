#!/usr/bin/env node
/**
 * Fails before CDK if secrets required for this deploy are missing.
 * CDK bakes process.env into Lambda on every deploy — empty values = broken prod.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.deploy');
loadEnv({ path: envPath });

function empty(v) {
  return v == null || String(v).trim() === '';
}

const missing = [];
if (empty(process.env.DB_PASSWORD)) missing.push('DB_PASSWORD');

if (missing.length === 0) {
  console.log(
    'Deploy env check OK: required variables are set for this deploy (from shell and/or .env.deploy).'
  );
  process.exit(0);
}

const hasFile = fs.existsSync(envPath);
console.error(
  '\n*** DEPLOY ABORTED: CDK would bake EMPTY values into Lambda and wipe your working config. ***\n' +
    'Missing or blank: ' +
    missing.join(', ') +
    '\n\n' +
    'Fix:\n' +
    '  1. Copy env.deploy.example → infrastructure/.env.deploy\n' +
    '  2. Fill in ALL required keys (never commit .env.deploy).\n' +
    '  3. Or export them in this shell before deploy (same terminal as cdk).\n\n' +
    (hasFile
      ? 'Your infrastructure/.env.deploy exists but the keys above are missing or empty.\n'
      : 'No infrastructure/.env.deploy found — create it, or exports are not set.\n') +
    'You need DB_PASSWORD for RDS-backed Lambdas.\n'
);
process.exit(1);

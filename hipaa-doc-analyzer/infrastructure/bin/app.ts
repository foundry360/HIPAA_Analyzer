#!/usr/bin/env node
import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { MainStack } from '../lib/main-stack';

/** Persisted deploy secrets (gitignored). Shell exports still win if set. */
loadEnv({ path: path.join(__dirname, '..', '.env.deploy') });

const app = new cdk.App();
new MainStack(app, 'HipaaDocAnalyzerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1'
  }
});

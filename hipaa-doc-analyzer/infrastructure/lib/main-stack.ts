import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

const backendDir = path.join(__dirname, '../../backend');
const frontendDist = path.join(__dirname, '../../frontend/dist');

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC ─────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'AnalyzerVPC', {
      maxAzs: 2,
      natGateways: 1
    });

    // ── KMS Keys ─────────────────────────────────────────────────
    const documentKey = new kms.Key(this, 'DocumentKey', {
      enableKeyRotation: true,
      description: 'HIPAA - Clinical document encryption key',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const tokenMapKey = new kms.Key(this, 'TokenMapKey', {
      enableKeyRotation: true,
      description: 'HIPAA - PHI token map encryption key',
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // ── S3: SPA static site (public; no PHI) ─────────────────────
    const frontendBucket = new s3.Bucket(this, 'FrontendWebsiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // ── S3 Bucket ────────────────────────────────────────────────
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      encryptionKey: documentKey,
      encryption: s3.BucketEncryption.KMS,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      enforceSSL: true,
      lifecycleRules: [{
        expiration: cdk.Duration.days(90),
        id: 'DeleteOldDocuments'
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [{
        allowedOrigins: [
          'http://localhost:5173',
          'http://localhost:3000',
          frontendBucket.bucketWebsiteUrl
        ],
        allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
        allowedHeaders: ['*']
      }]
    });

    // ── Cognito User Pool ────────────────────────────────────────
    const userPool = new cognito.UserPool(this, 'PhysicianUserPool', {
      userPoolName: 'hipaa-analyzer-physicians',
      selfSignUpEnabled: false,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: true,
        otp: true
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireSymbols: true,
        requireUppercase: true,
        requireLowercase: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      customAttributes: {
        /** Multi-tenant scope; UUID string; must match `tenants.id` in Postgres. */
        tenant_id: new cognito.StringAttribute({ mutable: true, minLen: 36, maxLen: 36 })
      }
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          profilePicture: true,
          phoneNumber: true
        })
        .withCustomAttributes('tenant_id')
    });

    // ── RDS PostgreSQL ───────────────────────────────────────────
    const dbSecurityGroup = new ec2.SecurityGroup(
      this, 'DBSecurityGroup', { vpc, allowAllOutbound: false }
    );

    const database = new rds.DatabaseInstance(this, 'AuditDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [dbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: documentKey,
      backupRetention: cdk.Duration.days(30),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // DB password: set via context (cdk deploy -c dbPassword=xxx) or env; for production use Secrets Manager
    const dbPassword =
      process.env.DB_PASSWORD ??
      this.node.tryGetContext('dbPassword') ??
      '';

    if (!dbPassword.trim()) {
      throw new Error(
        'Database password is required for Lambda (DB_PASSWORD). Deploy with:\n' +
          '  export DB_PASSWORD="your-app-password" && npx cdk deploy\n' +
          'or:\n' +
          '  npx cdk deploy -c dbPassword="your-app-password"\n' +
          'Use the same password you used when you first ran RunDbSetupFn (or run that Lambda again after changing it).'
      );
    }

    /** Optional break-glass: comma-separated emails that are always admins (in addition to primary + delegates). */
    const adminEmails =
      process.env.ADMIN_EMAILS ?? this.node.tryGetContext('adminEmails') ?? '';
    /** Optional: comma-separated entries matched to Cognito username or full email only (not email local-part). */
    const adminUsernames =
      process.env.ADMIN_USERNAMES ?? this.node.tryGetContext('adminUsernames') ?? '';
    /** Optional: bootstrap primary admin when app_config has no primary_admin_sub (Cognito sub). */
    const primaryAdminSub =
      process.env.PRIMARY_ADMIN_SUB ?? this.node.tryGetContext('primaryAdminSub') ?? '';
    /** Optional: bootstrap primary admin by email (resolved to sub once user exists in the pool). */
    const primaryAdminEmail =
      process.env.PRIMARY_ADMIN_EMAIL ?? this.node.tryGetContext('primaryAdminEmail') ?? '';

    /** Billing: Stripe + GHL (optional). Set at deploy time; not committed to git. */
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
    const billingCostTagKey = process.env.BILLING_COST_TAG_KEY ?? 'tenant_id';
    const ghlApiKey = process.env.GHL_API_KEY ?? '';
    const ghlLocationId = process.env.GHL_LOCATION_ID ?? '';
    const ghlFieldAwsUsd = process.env.GHL_CUSTOM_FIELD_ID_AWS_USD ?? '';

    // AWS_REGION is set automatically by the Lambda runtime
    const lambdaEnv: Record<string, string> = {
      S3_BUCKET_NAME: documentBucket.bucketName,
      S3_PRESIGNED_URL_EXPIRY: '900',
      KMS_KEY_ID: documentKey.keyId,
      KMS_TOKEN_MAP_KEY_ID: tokenMapKey.keyId,
      BEDROCK_MODEL_ID: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      BEDROCK_MAX_TOKENS: '1500',
      DB_HOST: database.instanceEndpoint.hostname,
      DB_PORT: '5432',
      DB_NAME: 'hipaa_analyzer',
      DB_USER: 'analyzer_user',
      DB_PASSWORD: dbPassword,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      /** Default tenant UUID for rows and users without custom:tenant_id (must match DB migration). */
      DEFAULT_TENANT_ID: '00000000-0000-4000-8000-000000000001',
      /** GHL: optional billing field sync (set at deploy). */
      GHL_API_KEY: ghlApiKey,
      GHL_LOCATION_ID: ghlLocationId,
      GHL_CUSTOM_FIELD_ID_AWS_USD: ghlFieldAwsUsd
    };

    // ── Lambda Functions (NodejsFunction bundles deps: uuid, pg, aws-sdk) ──
    // forceDockerBundling: false so deploy works without Docker (uses local esbuild)
    const nodeBundling = { forceDockerBundling: false };

    const getUploadUrlFn = new lambdaNode.NodejsFunction(this, 'GetUploadUrlFn', {
      entry: path.join(backendDir, 'src/handlers/getUploadUrl.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    // Stable name so IAM can reference ARN without Fn::GetAtt on the function (breaks Role↔Lambda cycle)
    const analyzeDocumentFunctionName = 'HipaaDocAnalyzer-analyze-document';

    const analyzeDocumentFn = new lambdaNode.NodejsFunction(this, 'AnalyzeDocumentFn', {
      entry: path.join(backendDir, 'src/handlers/analyzeDocument.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      functionName: analyzeDocumentFunctionName
    });
    // Self-invoke: runtime sets AWS_LAMBDA_FUNCTION_NAME to functionName above

    const analyzeSelfInvokeArn = this.formatArn({
      service: 'lambda',
      resource: 'function',
      resourceName: analyzeDocumentFunctionName,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME
    });

    analyzeDocumentFn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [analyzeSelfInvokeArn]
    }));

    const getResultFn = new lambdaNode.NodejsFunction(this, 'GetResultFn', {
      entry: path.join(backendDir, 'src/handlers/getResult.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const documentChatFn = new lambdaNode.NodejsFunction(this, 'DocumentChatFn', {
      entry: path.join(backendDir, 'src/handlers/documentChat.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(60),
      memorySize: 256
    });

    const savedSummariesFn = new lambdaNode.NodejsFunction(this, 'SavedSummariesFn', {
      entry: path.join(backendDir, 'src/handlers/savedSummaries.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const getDocumentViewUrlFn = new lambdaNode.NodejsFunction(this, 'GetDocumentViewUrlFn', {
      entry: path.join(backendDir, 'src/handlers/getDocumentViewUrl.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const getRedactedPreviewFn = new lambdaNode.NodejsFunction(this, 'GetRedactedPreviewFn', {
      entry: path.join(backendDir, 'src/handlers/getRedactedPreview.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    const sharesFn = new lambdaNode.NodejsFunction(this, 'SharesFn', {
      entry: path.join(backendDir, 'src/handlers/shares.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const adminUsersFn = new lambdaNode.NodejsFunction(this, 'AdminUsersFn', {
      entry: path.join(backendDir, 'src/handlers/adminUsers.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: {
        ...lambdaEnv,
        ADMIN_EMAILS: adminEmails,
        ADMIN_USERNAMES: adminUsernames,
        PRIMARY_ADMIN_SUB: primaryAdminSub,
        PRIMARY_ADMIN_EMAIL: primaryAdminEmail
      },
      vpc,
      timeout: cdk.Duration.seconds(30)
    });

    const runDbSetupFn = new lambdaNode.NodejsFunction(this, 'RunDbSetupFn', {
      entry: path.join(backendDir, 'src/handlers/runDbSetup.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: {
        ...lambdaEnv,
        DB_SECRET_ARN: database.secret!.secretArn
      },
      vpc,
      timeout: cdk.Duration.minutes(2)
    });
    database.connections.allowFrom(runDbSetupFn, ec2.Port.tcp(5432));
    database.secret!.grantRead(runDbSetupFn);

    /** Read-only DB inspection (invoke via CLI only; no API Gateway). */
    const dbInspectFn = new lambdaNode.NodejsFunction(this, 'DbInspectFn', {
      entry: path.join(backendDir, 'src/handlers/dbInspect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: lambdaEnv,
      vpc,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });
    database.connections.allowFrom(dbInspectFn, ec2.Port.tcp(5432));

    /** Insert tenant + create first Cognito user (CLI invoke only; no API Gateway). */
    const tenantBootstrapFn = new lambdaNode.NodejsFunction(this, 'TenantBootstrapFn', {
      entry: path.join(backendDir, 'src/handlers/tenantBootstrap.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: {
        ...lambdaEnv,
        ADMIN_EMAILS: adminEmails,
        ADMIN_USERNAMES: adminUsernames,
        PRIMARY_ADMIN_SUB: primaryAdminSub,
        PRIMARY_ADMIN_EMAIL: primaryAdminEmail
      },
      vpc,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });
    database.connections.allowFrom(tenantBootstrapFn, ec2.Port.tcp(5432));

    /** Monthly: Cost Explorer (tagged cost) → Stripe invoice → GHL contact field → billing_period_charges. */
    const monthlyBillingFn = new lambdaNode.NodejsFunction(this, 'MonthlyBillingFn', {
      entry: path.join(backendDir, 'src/handlers/monthlyBilling.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      projectRoot: backendDir,
      depsLockFilePath: path.join(backendDir, 'package-lock.json'),
      bundling: nodeBundling,
      environment: {
        ...lambdaEnv,
        STRIPE_SECRET_KEY: stripeSecretKey,
        BILLING_COST_TAG_KEY: billingCostTagKey
      },
      vpc,
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });
    database.connections.allowFrom(monthlyBillingFn, ec2.Port.tcp(5432));

    monthlyBillingFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ce:GetCostAndUsage', 'ce:GetDimensionValues'],
        resources: ['*']
      })
    );

    new events.Rule(this, 'MonthlyBillingSchedule', {
      description: '1st of month 12:00 UTC — allocated AWS cost billing (see MonthlyBillingFn)',
      schedule: events.Schedule.expression('cron(0 12 1 * ? *)'),
      targets: [new targets.LambdaFunction(monthlyBillingFn)]
    });

    // ── Grant Permissions ────────────────────────────────────────
    documentBucket.grantReadWrite(getUploadUrlFn);
    documentBucket.grantRead(analyzeDocumentFn);
    documentBucket.grantRead(getDocumentViewUrlFn);
    documentBucket.grantReadWrite(savedSummariesFn);
    documentKey.grantEncryptDecrypt(getUploadUrlFn);
    documentKey.grantEncryptDecrypt(analyzeDocumentFn);
    documentKey.grantDecrypt(getDocumentViewUrlFn);
    documentKey.grantEncryptDecrypt(savedSummariesFn);
    tokenMapKey.grantEncryptDecrypt(analyzeDocumentFn);
    database.connections.allowFrom(analyzeDocumentFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(getResultFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(documentChatFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(savedSummariesFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(getDocumentViewUrlFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(getRedactedPreviewFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(sharesFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(adminUsersFn, ec2.Port.tcp(5432));

    sharesFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminGetUser'],
        resources: [userPool.userPoolArn]
      })
    );

    adminUsersFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:ListUsers',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminDeleteUser',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser'
        ],
        resources: [userPool.userPoolArn]
      })
    );

    tenantBootstrapFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminGetUser', 'cognito-idp:ListUsers'],
        resources: [userPool.userPoolArn]
      })
    );

    // Analyze pipeline: Textract, Comprehend Medical, Bedrock
    analyzeDocumentFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'textract:AnalyzeDocument',
        'textract:DetectDocumentText',
        'textract:StartDocumentTextDetection',
        'textract:GetDocumentTextDetection'
      ],
      resources: ['*']
    }));
    analyzeDocumentFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['comprehendmedical:DetectPHI'],
      resources: ['*']
    }));
    analyzeDocumentFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*']
    }));
    // Bedrock Marketplace: allow model subscription (required for first-time use of some models)
    analyzeDocumentFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
      resources: ['*']
    }));

    documentChatFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: ['*']
    }));
    documentChatFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['aws-marketplace:ViewSubscriptions', 'aws-marketplace:Subscribe'],
      resources: ['*']
    }));

    // ── API Gateway ──────────────────────────────────────────────
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'Authorizer',
      { cognitoUserPools: [userPool] }
    );

    const api = new apigateway.RestApi(this, 'AnalyzerAPI', {
      restApiName: 'hipaa-doc-analyzer',
      /** REGIONAL: new routes are available immediately; EDGE (default) can delay via CloudFront. */
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'GET', 'DELETE', 'PATCH', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type']
      }
    });

    const authOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    };

    // Avoid RestApi ↔ Lambda Permission ↔ Deployment circular refs (CloudFormation ValidationError)
    const lambdaIntegration = (fn: lambda.IFunction) =>
      new apigateway.LambdaIntegration(fn, {
        allowTestInvoke: false,
        scopePermissionToMethod: false
      });

    api.root
      .addResource('upload-url')
      .addMethod(
        'POST',
        lambdaIntegration(getUploadUrlFn),
        authOptions
      );

    api.root
      .addResource('analyze')
      .addMethod(
        'POST',
        lambdaIntegration(analyzeDocumentFn),
        authOptions
      );

    const resultResource = api.root.addResource('result');
    const resultDocumentResource = resultResource.addResource('{documentId}');
    resultDocumentResource.addMethod(
      'GET',
      lambdaIntegration(getResultFn),
      authOptions
    );

    api.root.addResource('document-chat').addMethod(
      'POST',
      lambdaIntegration(documentChatFn),
      authOptions
    );

    const savedSummariesResource = api.root.addResource('saved-summaries');
    savedSummariesResource.addMethod(
      'GET',
      lambdaIntegration(savedSummariesFn),
      authOptions
    );
    savedSummariesResource.addMethod(
      'POST',
      lambdaIntegration(savedSummariesFn),
      authOptions
    );
    const savedSummariesByDocumentResource = savedSummariesResource.addResource('{documentId}');
    savedSummariesByDocumentResource.addMethod(
      'PATCH',
      lambdaIntegration(savedSummariesFn),
      authOptions
    );
    savedSummariesByDocumentResource.addMethod(
      'DELETE',
      lambdaIntegration(savedSummariesFn),
      authOptions
    );

    const documentResource = api.root.addResource('document');
    const documentIdForViewResource = documentResource.addResource('{documentId}');
    const documentViewUrlResource = documentIdForViewResource.addResource('view-url');
    documentViewUrlResource.addMethod(
      'GET',
      lambdaIntegration(getDocumentViewUrlFn),
      authOptions
    );
    const documentRedactedPreviewResource = documentIdForViewResource.addResource('redacted-preview');
    documentRedactedPreviewResource.addMethod(
      'GET',
      lambdaIntegration(getRedactedPreviewFn),
      authOptions
    );

    const sharesResource = api.root.addResource('shares');
    sharesResource.addMethod('POST', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addMethod('GET', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addResource('user-search').addMethod('GET', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addResource('incoming').addMethod('GET', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addResource('{shareId}').addMethod('DELETE', lambdaIntegration(sharesFn), authOptions);

    const adminResource = api.root.addResource('admin');
    adminResource.addResource('me').addMethod('GET', lambdaIntegration(adminUsersFn), authOptions);
    const adminAdminsResource = adminResource.addResource('admins');
    adminAdminsResource.addMethod('GET', lambdaIntegration(adminUsersFn), authOptions);
    adminAdminsResource.addMethod('POST', lambdaIntegration(adminUsersFn), authOptions);
    adminAdminsResource.addResource('{sub}').addMethod('DELETE', lambdaIntegration(adminUsersFn), authOptions);
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource.addMethod('GET', lambdaIntegration(adminUsersFn), authOptions);
    adminUsersResource.addMethod('POST', lambdaIntegration(adminUsersFn), authOptions);
    const adminUserByUsernameResource = adminUsersResource.addResource('{username}');
    adminUserByUsernameResource.addMethod('PATCH', lambdaIntegration(adminUsersFn), authOptions);
    adminUserByUsernameResource.addMethod('DELETE', lambdaIntegration(adminUsersFn), authOptions);

    // CORS on gateway error responses (502, 504, 4xx) so browser gets headers when Lambda fails or times out.
    // Only Access-Control-Allow-Origin; comma in Allow-Headers is invalid as a gateway response mapping.
    const corsOriginOnly = { 'Access-Control-Allow-Origin': "'*'" };
    api.addGatewayResponse('Default4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsOriginOnly
    });
    api.addGatewayResponse('Default5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsOriginOnly
    });
    api.addGatewayResponse('IntegrationFailure', {
      type: apigateway.ResponseType.INTEGRATION_FAILURE,
      responseHeaders: corsOriginOnly
    });
    api.addGatewayResponse('IntegrationTimeout', {
      type: apigateway.ResponseType.INTEGRATION_TIMEOUT,
      responseHeaders: corsOriginOnly
    });

    // ── Outputs ──────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'APIUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId
    });
    new cdk.CfnOutput(this, 'BucketName', {
      value: documentBucket.bucketName
    });
    new cdk.CfnOutput(this, 'FrontendWebsiteURL', {
      value: frontendBucket.bucketWebsiteUrl,
      description: 'HIPAA Analyzer UI (build frontend before cdk deploy)'
    });
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: frontendBucket.bucketName
    });

    new s3deploy.BucketDeployment(this, 'FrontendDeploy', {
      sources: [s3deploy.Source.asset(frontendDist)],
      destinationBucket: frontendBucket,
      prune: true
    });

    new cdk.CfnOutput(this, 'RunDbSetupFunctionName', {
      value: runDbSetupFn.functionName,
      description: 'Invoke once to create DB and schema: aws lambda invoke --function-name <value> --region us-east-1 out.json'
    });
    new cdk.CfnOutput(this, 'DbInspectFunctionName', {
      value: dbInspectFn.functionName,
      description:
        'VPC read-only DB helper (CLI invoke only): aws lambda invoke --function-name <value> --cli-binary-format raw-in-base64-out --payload \'{"action":"listAnalysis"}\' out.json'
    });
    new cdk.CfnOutput(this, 'TenantBootstrapFunctionName', {
      value: tenantBootstrapFn.functionName,
      description:
        'Create tenant + first user: hipaa-doc-analyzer/scripts/bootstrap-tenant.sh (see DEPLOY.md)'
    });
    new cdk.CfnOutput(this, 'MonthlyBillingFunctionName', {
      value: monthlyBillingFn.functionName,
      description:
        'Monthly AWS cost → Stripe + GHL (see DEPLOY.md billing section). Manual: aws lambda invoke with optional {"periodYyyymm":"2026-03","dryRun":true}'
    });
  }
}

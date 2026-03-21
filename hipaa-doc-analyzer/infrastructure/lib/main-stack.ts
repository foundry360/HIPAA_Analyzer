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
import { Construct } from 'constructs';

const backendDir = path.join(__dirname, '../../backend');

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
        allowedOrigins: ['http://localhost:5173', 'http://localhost:3000'],
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
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const userPoolClient = userPool.addClient('WebClient', {
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(1)
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
      COGNITO_USER_POOL_ID: userPool.userPoolId
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

    // ── Grant Permissions ────────────────────────────────────────
    documentBucket.grantReadWrite(getUploadUrlFn);
    documentBucket.grantRead(analyzeDocumentFn);
    documentBucket.grantRead(getDocumentViewUrlFn);
    documentKey.grantEncryptDecrypt(getUploadUrlFn);
    documentKey.grantEncryptDecrypt(analyzeDocumentFn);
    documentKey.grantDecrypt(getDocumentViewUrlFn);
    tokenMapKey.grantEncryptDecrypt(analyzeDocumentFn);
    database.connections.allowFrom(analyzeDocumentFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(getResultFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(savedSummariesFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(getDocumentViewUrlFn, ec2.Port.tcp(5432));
    database.connections.allowFrom(sharesFn, ec2.Port.tcp(5432));

    sharesFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cognito-idp:ListUsers'],
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
        allowMethods: ['POST', 'GET', 'DELETE', 'OPTIONS'],
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

    const documentResource = api.root.addResource('document');
    const documentIdForViewResource = documentResource.addResource('{documentId}');
    const documentViewUrlResource = documentIdForViewResource.addResource('view-url');
    documentViewUrlResource.addMethod(
      'GET',
      lambdaIntegration(getDocumentViewUrlFn),
      authOptions
    );

    const sharesResource = api.root.addResource('shares');
    sharesResource.addMethod('POST', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addMethod('GET', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addResource('incoming').addMethod('GET', lambdaIntegration(sharesFn), authOptions);
    sharesResource.addResource('{shareId}').addMethod('DELETE', lambdaIntegration(sharesFn), authOptions);

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
    new cdk.CfnOutput(this, 'RunDbSetupFunctionName', {
      value: runDbSetupFn.functionName,
      description: 'Invoke once to create DB and schema: aws lambda invoke --function-name <value> --region us-east-1 out.json'
    });
  }
}

import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_rds as rds } from 'aws-cdk-lib';
import { aws_lambda as lambda } from 'aws-cdk-lib';
import * as path from 'path';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
export class LambdaFunctionUrLsRdsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /*
    const vpc = ec2.Vpc.fromLookup(this, 'Vpc',{
      vpcId: 'xxxxx'
    })
    */


    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      cidr: '10.1.0.0/16',
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    const bastionGroup = new ec2.SecurityGroup(
      this,
      'Bastion to DB Connection',
      {
        vpc,
      }
    );

    const lambdaToRDSProxyGroup = new ec2.SecurityGroup(
      this,
      'Lambda to RDS Proxy Connection',
      {
        vpc,
      }
    );

    const dbConnectionGroup = new ec2.SecurityGroup(
      this,
      'Proxy to DB Connection',
      {
        vpc,
      }
    );

    dbConnectionGroup.addIngressRule(
      dbConnectionGroup,
      ec2.Port.tcp(5432),
      'allow db connection'
    );

    dbConnectionGroup.addIngressRule(
      lambdaToRDSProxyGroup,
      ec2.Port.tcp(5432),
      'allow lambda connection'
    );

    dbConnectionGroup.addIngressRule(
      bastionGroup,
      ec2.Port.tcp(5432),
      'allow bastion connection'
    );

    // Lambda関数からSecret ManagerにアクセスするためのVPCエンドポイント
    new ec2.InterfaceVpcEndpoint(this, 'SecretManagerVpcEndpoint', {
      vpc: vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    /*
    // 踏み台サーバを配置
    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc: vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      securityGroup: bastionGroup,
      subnetSelection: {
        subnetType: ec2.SubnetType.PUBLIC,
      }
    })

    bastion.instance.addUserData('yum -y update', 'yum install -y postgresql jq')
    */

    // RDSインスタンス作成
    const rdsInstance = new rds.DatabaseInstance(this, 'DBInstance', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_12_10
      }),
      credentials: {
        username: 'postgres',
        secretName: 'dbSecret'
      },
      vpc: vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      removalPolicy: RemovalPolicy.DESTROY,
      deleteAutomatedBackups: false,
      securityGroups: [dbConnectionGroup],
      port: 5432,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      databaseName: "test"
      
    }
    )

    // RDS Proxy
    const rdsProxy = rdsInstance.addProxy(id + '-proxy', {
      secrets: [rdsInstance.secret!],
      vpc: vpc,
      debugLogging: true,
      securityGroups: [dbConnectionGroup]
    })

    // レイヤーを定義
    const layer =  lambda.LayerVersion.fromLayerVersionArn(this, 'Psycopg2',
      "arn:aws:lambda:ap-northeast-1:898466741470:layer:psycopg2-py38:1"
    )



    // 関数を定義
    const lambdaFunction = new lambda.Function(this, 'LambdaFunction', {
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: 'rds_lambda.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      securityGroups:[lambdaToRDSProxyGroup],
      layers:[layer],
      environment:{
        RDS_PROXY_ENDPOINT: rdsProxy.endpoint,
        RDS_SECRET_NAME: "dbSecret",
        RDS_DB_NAME: "test"
      },
      vpc:vpc,
      vpcSubnets:{
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      }
    })

    // lambdaの実行ロール
    const lambdaRole = lambdaFunction.role;

    // Functions URL
    const functionUrl = lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    // URLを出力
    new CfnOutput(this, 'FunctionURL', {
      value: functionUrl.url
    });

    // LambdaにSecret読む権限を付与
    rdsInstance.secret!.grantRead(lambdaRole!);

  }
}

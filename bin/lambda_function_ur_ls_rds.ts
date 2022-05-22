#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LambdaFunctionURLsRdsStack } from '../lib/lambda_function_ur_ls_rds-stack';

const app = new cdk.App();
new LambdaFunctionURLsRdsStack(app, 'LambdaFunctionUrLsRdsStack', {});
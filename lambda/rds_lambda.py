import json
import os
import boto3
import psycopg2
import logging
from botocore.client import Config
from psycopg2.extras import LoggingConnection

logger = logging.getLogger()

# DEBUGにすると実行したSQL文をログに出力する。
logger.setLevel(logging.INFO)
# logger.setLevel(logging.DEBUG)


RDS_SECRET_NAME = os.environ["RDS_SECRET_NAME"]
RDS_PROXY_ENDPOINT = os.environ["RDS_PROXY_ENDPOINT"]
RDS_DB_NAME = os.environ["RDS_DB_NAME"]


def get_connection(rds_secret):
    connection = psycopg2.connect(
        connection_factory=LoggingConnection,
        host=RDS_PROXY_ENDPOINT,
        database=RDS_DB_NAME,
        user=rds_secret["username"],
        password=rds_secret["password"])
    connection.initialize(logger)
    return connection


def handler(event, context):
    logger.info("#############Start############")
    logger.info("Receieved request:" + str(event))

    client = boto3.client('rds')

    # DBの接続情報を取得
    try:
        config = Config(connect_timeout=5, retries={'max_attempts': 0})
        client = boto3.client(service_name='secretsmanager',
                              config=config)

        get_secret_value_response = client.get_secret_value(
            SecretId=RDS_SECRET_NAME)
    except Exception:
        logger.error("Error occured when getting secret_value")
        raise

    # 接続情報に格納
    rds_secret = json.loads(get_secret_value_response['SecretString'])

    """
    # DBを作成する場合
    with get_connection(rds_secret) as connection:
        with conn.autocommit = True
            with connection.cursor() as cur:
                cur.execute('create database test_db2')
    """

    with get_connection(rds_secret) as connection:
        with connection.cursor() as cur:
            cur.execute(
                "CREATE TABLE employee(id serial primary key, name text)")

    # SQLを実行
    with get_connection(rds_secret) as connection:
        with connection.cursor() as cur:
            cur.execute(
                "INSERT INTO employee(name) VALUES ('hoge'),('hogehoge'),('hogehogehoge')")

            # 可変値を埋め込む場合
            #cur.execute('SELECT * FROM users WHERE name = %s', (name,))

    with get_connection(rds_secret) as connection:
        with connection.cursor() as cur:
            cur.execute('SELECT * FROM employee')
            results = cur.fetchall()

            # コンソールへ出力
            for r in results:
                logger.info(r)

    logger.info("#############End############")

    return {
        'status': 'ok'
    }

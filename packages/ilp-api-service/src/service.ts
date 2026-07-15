import { IlpServiceServer } from './grpc/grpc-service';

import { DomainEventTopics } from 'common-types-lib';
import process from 'process';
import crypto from 'crypto';
import {
  KafkaBuilder,
  KafkaConsumer,
  KafkaProducer,
  MessageSerializationFactory,
  PinoLogger
} from 'implementations-lib';
import { MongoDbPeerRepository } from 'ilp-implementations-lib';

const BC_NAME = 'ILP';
const APP_NAME = `${BC_NAME}_API_SVC`;
const INSTANCE_ID = `${APP_NAME}_${crypto.randomUUID()}`;

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';
const MONGODB_URL = process.env['MONGODB_URL'] || 'mongodb://localhost:27017';

export class IlpApiService {
  private static grpcService: IlpServiceServer;
  private static msgProducer: KafkaProducer;
  private static msgConsumer: KafkaConsumer;
  private static repo: MongoDbPeerRepository;

  static async start(): Promise<void> {
    const logger = new PinoLogger({
      bcName: BC_NAME,
      appName: APP_NAME,
      instanceId: INSTANCE_ID
    });

    // Read-only in this process — CreatePeer/UpdatePeer are always routed
    // through Kafka commands so ilp-command-handler-service remains the
    // single writer of the peer repository.
    this.repo = new MongoDbPeerRepository(
      MONGODB_URL,
      logger.child('peer-repo')
    );
    await this.repo.init();

    const kafkaBuilder = new KafkaBuilder()
      .withLogger(logger.child('kafka'))
      .withBrokerList(KAFKA_URL)
      .withClientId(INSTANCE_ID)
      .withSerializerFactory(MessageSerializationFactory.instance());

    this.msgProducer = kafkaBuilder.buildProducer({});
    await this.msgProducer.connect();

    this.msgConsumer = kafkaBuilder.buildConsumer({
      consumerGroupId: `ilp-api-service`
    });
    this.msgConsumer.setTopics([DomainEventTopics.IlpEvents]);
    await this.msgConsumer.connect();
    await this.msgConsumer.startAndWaitForRebalance();

    this.grpcService = new IlpServiceServer(
      '0.0.0.0:50053',
      this.msgProducer,
      this.msgConsumer,
      this.repo,
      logger.child('grpc')
    );

    await this.grpcService.start();
  }

  static async stop(): Promise<void> {
    await this.grpcService.stop();
    await this.msgConsumer.stop();
    await this.msgProducer.disconnect();
    await this.msgConsumer.disconnect();
    await this.repo.destroy();
  }
}

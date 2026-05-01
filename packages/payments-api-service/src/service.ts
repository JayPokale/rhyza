import { PaymentsServiceServer } from './grpc/grpc-service';

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

const INSTANCE_ID = `PAYMENTS_API_SVC_${crypto.randomUUID()}`;
const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';

export class PaymentsApiService {
  private static grpcService: PaymentsServiceServer;
  private static msgProducer: KafkaProducer;
  private static msgConsumer: KafkaConsumer;

  static async start(): Promise<void> {
    const logger = new PinoLogger();

    KafkaBuilder.instance()
      .withLogger(logger)
      .withBrokerList(KAFKA_URL)
      .withClientId(INSTANCE_ID)
      .withSerializerFactory(MessageSerializationFactory.instance());

    this.msgProducer = KafkaBuilder.instance().buildProducer({});
    await this.msgProducer.connect();

    this.msgConsumer = KafkaBuilder.instance().buildConsumer({
      consumerGroupId: `payments-api-service`
    });
    this.msgConsumer.setTopics([DomainEventTopics.PaymentEvents]);
    await this.msgConsumer.connect();
    await this.msgConsumer.startAndWaitForRebalance();

    this.grpcService = new PaymentsServiceServer(
      '1',
      '0.0.0.0:50052',
      this.msgProducer,
      this.msgConsumer
    );

    await this.grpcService.start();
  }

  static async stop(): Promise<void> {
    await this.grpcService.stop();
    await this.msgConsumer.stop();
    await this.msgProducer.disconnect();
    await this.msgConsumer.disconnect();
  }
}

import { PaymentsServiceServer } from './grpc/grpc-service';
import {
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonConsumer
} from 'implementations-lib';
import { DomainEventTopics, ILogger } from 'common-types-lib';
import process from 'process';
import {PinoLogger} from "implementations-lib/dist";

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';

export class PaymentsApiService {
  private static logger: ILogger;
  private static grpcService: PaymentsServiceServer;
  private static msgProducer: RafikiKafkaJsonProducer;
  private static msgConsumer: RafikiKafkaJsonConsumer;

  static async start(): Promise<void> {
    this.logger = new PinoLogger();

    this.msgProducer = new RafikiKafkaJsonProducer({
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `payments-api-service-${crypto.randomUUID()}`
    },
      this.logger
    );
    await this.msgProducer.connect();

    this.msgConsumer = new RafikiKafkaJsonConsumer({
      kafkaBrokerList: KAFKA_URL,
      kafkaGroupId: `payments-api-service`
    },
      this.logger
    );
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

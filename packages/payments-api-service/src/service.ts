'use strict';

import { PaymentsServiceServer } from './grpc/grpc-service';
import {
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions
} from 'implementations-lib';
import process from 'process';

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';

export class PaymentsApiService {
  private static grpcService: PaymentsServiceServer;
  private static msgProducer: RafikiKafkaJsonProducer;

  static async start(): Promise<void> {
    const producerOptions: RafikiKafkaJsonProducerOptions = {
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `payments-api-service-${crypto.randomUUID()}`
    };
    this.msgProducer = new RafikiKafkaJsonProducer(producerOptions);
    await this.msgProducer.connect();

    this.grpcService = new PaymentsServiceServer(
      '1',
      '0.0.0.0:50052',
      this.msgProducer
    );

    await this.grpcService.start();
  }

  static async stop(): Promise<void> {
    await this.grpcService.stop();
    await this.msgProducer.disconnect();
  }
}

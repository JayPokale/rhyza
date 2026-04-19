import {
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonConsumer
} from 'implementations-lib';
import { PaymentsEventHandler } from './event-handler';
import process from 'process';

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9092';

export class PaymentsEventHandlerService {
  private static eventHandler: PaymentsEventHandler;
  private static msgProducer: RafikiKafkaJsonProducer;
  private static msgConsumer: RafikiKafkaJsonConsumer;

  static async start(): Promise<void> {
    this.msgProducer = new RafikiKafkaJsonProducer({
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `payments-event-handler-${crypto.randomUUID()}`
    });
    await this.msgProducer.connect();

    this.msgConsumer = new RafikiKafkaJsonConsumer({
      kafkaBrokerList: KAFKA_URL,
      kafkaGroupId: 'payments-event-handler'
    });

    this.eventHandler = new PaymentsEventHandler(
      this.msgConsumer,
      this.msgProducer
    );

    await this.eventHandler.start();
  }

  static async stop(): Promise<void> {
    await this.eventHandler.stop();
    await this.msgProducer.disconnect();
  }
}

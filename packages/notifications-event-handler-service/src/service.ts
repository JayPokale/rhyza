import { NotificationsEventHandler } from './event-handler';
import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonProducer
} from '../../implementations-lib/dist';

const KAFKA_URL = process.env.KAFKA_URL || 'localhost:9093';

export class NotificationsEventHandlerService {
  private static eventHandler: NotificationsEventHandler;
  private static msgProducer: RafikiKafkaJsonProducer;
  private static msgConsumer: RafikiKafkaJsonConsumer;

  static async start(): Promise<void> {
    this.msgProducer = new RafikiKafkaJsonProducer({
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `notifications-event-handler-${crypto.randomUUID()}`
    });
    await this.msgProducer.connect();

    this.msgConsumer = new RafikiKafkaJsonConsumer({
      kafkaBrokerList: KAFKA_URL,
      kafkaGroupId: 'notifications-event-handler'
    });

    this.eventHandler = new NotificationsEventHandler(
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

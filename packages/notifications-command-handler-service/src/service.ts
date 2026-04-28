import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonProducer
} from 'implementations-lib';
import { NotificationAggregate } from 'notifications-domain-lib';
import {
  MongoDbNotificationRepo,
  NotificationSenderService
} from 'notifications-implementations-lib';
import { NotificationsCommandHandler } from './cmd-handler';

const MONGODB_URL = process.env['MONGODB_URL'] || 'mongodb://localhost:27018';
const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9093';
const CONSUMER_BATCH_SIZE =
  (process.env['CONSUMER_BATCH_SIZE'] &&
    parseInt(process.env['CONSUMER_BATCH_SIZE'])) ||
  250;
const CONSUMER_BATCH_TIMEOUT_MS =
  (process.env['CONSUMER_BATCH_TIMEOUT_MS'] &&
    parseInt(process.env['CONSUMER_BATCH_TIMEOUT_MS'])) ||
  50;

export class NotificationsCommandHandlerService {
  private static repo: MongoDbNotificationRepo;
  private static msgProducer: RafikiKafkaJsonProducer;
  private static msgConsumer: RafikiKafkaJsonConsumer;
  private static commandHandler: NotificationsCommandHandler;

  static async start(): Promise<void> {
    this.repo = new MongoDbNotificationRepo(MONGODB_URL);
    await this.repo.init();

    const notificationSenderService = new NotificationSenderService();

    const aggregate = new NotificationAggregate(
      this.repo,
      notificationSenderService
    );

    this.msgProducer = new RafikiKafkaJsonProducer({
      kafkaBrokerList: KAFKA_URL,
      producerClientId: `notifications-cmd-handler-${crypto.randomUUID()}`
    });

    await this.msgProducer.connect();

    this.msgConsumer = new RafikiKafkaJsonConsumer({
      kafkaBrokerList: KAFKA_URL,
      kafkaGroupId: 'notifications-cmd-handler',
      batchSize: CONSUMER_BATCH_SIZE,
      batchTimeoutMs: CONSUMER_BATCH_TIMEOUT_MS
    });

    this.commandHandler = new NotificationsCommandHandler(
      this.msgConsumer,
      this.msgProducer,
      aggregate
    );

    await this.commandHandler.start();
  }

  static async stop(): Promise<void> {
    await this.commandHandler.stop();
    await this.msgProducer.disconnect();
    await this.repo.destroy();
  }
}

import { ILogger, IMessageConsumer, IMessageProducer } from 'common-types-lib';
import {
  KafkaBuilder,
  MessageSerializationFactory,
  PinoLogger
} from 'implementations-lib';
import { IlpEventHandler } from './event-handler';

const KAFKA_URL = process.env['KAFKA_URL'] || 'localhost:9093';
const EVENT_HANDLER_GROUP_ID = 'ilp-event-handler';

export class IlpEventHandlerService {
  private static _logger: ILogger;
  private static _producer: IMessageProducer;
  private static _eventHandlerConsumer: IMessageConsumer;
  private static _eventHandler: IlpEventHandler;

  static async start(deps?: {
    logger?: ILogger;
    producer?: IMessageProducer;
    eventHandlerConsumer?: IMessageConsumer;
  }): Promise<void> {
    this._logger = deps?.logger ?? new PinoLogger();
    this._logger.info('Starting IlpEventHandlerService...');

    let kafkaBuilder: KafkaBuilder | undefined;
    const builder = (): KafkaBuilder => {
      kafkaBuilder ??= new KafkaBuilder()
        .withBrokerList(KAFKA_URL)
        .withClientId(`ILP_EVENT_HANDLER_SVC_${crypto.randomUUID()}`)
        .withSerializerFactory(MessageSerializationFactory.instance())
        .withLogger(this._logger);
      return kafkaBuilder;
    };

    this._producer = deps?.producer ?? builder().buildProducer({});
    await this._producer.connect();

    this._eventHandlerConsumer =
      deps?.eventHandlerConsumer ??
      builder().buildConsumer({ consumerGroupId: EVENT_HANDLER_GROUP_ID });
    this._eventHandler = new IlpEventHandler(
      this._eventHandlerConsumer,
      this._producer,
      this._logger
    );
    await this._eventHandler.start();

    this._logger.info('IlpEventHandlerService ready');
  }

  static async stop(): Promise<void> {
    if (this._eventHandler) await this._eventHandler.stop();
    if (this._producer) await this._producer.disconnect();
  }
}

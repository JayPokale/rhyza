import { KafkaJS } from '@confluentinc/kafka-javascript';
import {
  ILogger,
  IMessage,
  IMessageProducer,
  IMessageProducerAcks,
  IRawMessageSerializerFactory
} from 'common-types-lib';
import { KafkaUtil } from './kafka-util';

export class KafkaProducer implements IMessageProducer {
  private readonly _logger: ILogger;
  private readonly _producer: KafkaJS.Producer;
  private readonly _kafka: KafkaJS.Kafka;
  private readonly _serializerFactory: IRawMessageSerializerFactory;

  constructor(
    kafka: KafkaJS.Kafka,
    producer: KafkaJS.Producer,
    serializerFactory: IRawMessageSerializerFactory,
    logger: ILogger
  ) {
    this._logger = logger;
    this._serializerFactory = serializerFactory;

    this._kafka = kafka;
    this._producer = producer;
  }

  private _convertIMessageArrayToTopicMessages(
    messages: IMessage | IMessage[]
  ): KafkaJS.TopicMessages[] {
    if (!Array.isArray(messages)) messages = [messages];

    const retTopicMessages: KafkaJS.TopicMessages[] = [];

    for (const msg of messages) {
      const topicMsg = KafkaUtil.convertToKafkaMsg(
        this._serializerFactory.serialize(msg)
      );
      let topic = retTopicMessages.find((tp) => tp.topic === msg.msgTopic);
      if (!topic) {
        topic = { topic: msg.msgTopic, messages: [topicMsg] };
        retTopicMessages.push(topic);
      } else {
        topic.messages.push(topicMsg);
      }
    }

    return retTopicMessages;
  }

  async sendWithoutAcks(message: IMessage | IMessage[]): Promise<void> {
    const topicMessages = this._convertIMessageArrayToTopicMessages(message);

    // we're ignoring the promise on purpose
    this._producer.sendBatch({ topicMessages }).catch((e) => {
      this._logger?.error(e, `Error sending message to Kafka - ${e.message}}`);
      throw e;
    });

    this._logger?.debug(`${this.constructor.name} - send completed`);
  }

  async send(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]> {
    const topicMessages = this._convertIMessageArrayToTopicMessages(message);

    const acks: KafkaJS.RecordMetadata[] = await this._producer.sendBatch({
      topicMessages
    });

    const resIMessageProducerSendAcks: IMessageProducerAcks[] = acks.map(
      (item) => {
        const sentTopicMsg = topicMessages.find(
          (tm) => tm.topic === item.topicName
        );

        return {
          topic: item.topicName,
          partition: item.partition,
          lastMsgOffset:
            Number(item.baseOffset) +
            (sentTopicMsg ? sentTopicMsg.messages.length : 0)
        };
      }
    );

    //this._logger?.debug(`${this.constructor.name} - send completed - ret is: ${JSON.stringify(resIMessageProducerSendAcks, null, 2)}`);

    return resIMessageProducerSendAcks;
  }

  async destroy(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - destroy called...`);
    return await this.disconnect();
  }

  async connect(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - connect called...`);
    await this._producer.connect();
  }

  async disconnect(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - disconnect called...`);
    // automatically flushes
    await this._producer.disconnect();
  }
}

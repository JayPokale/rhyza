/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import {KafkaJS} from '@confluentinc/kafka-javascript';
import {
  ILogger,
  IMessage,
  IMessageProducer,
  IMessageProducerAcks,
  IRawMessageSerializerFactory,
} from 'common-types-lib';
import {KafkaProducerOptions} from "./types";

export class KafkaProducer implements IMessageProducer {
  private readonly _logger: ILogger;
  private readonly _options: KafkaProducerOptions;
  private readonly _producer: KafkaJS.Producer;
  private readonly _kafka:KafkaJS.Kafka;
  private readonly _serializerFactory: IRawMessageSerializerFactory;

  constructor(kafka: KafkaJS.Kafka, producer: KafkaJS.Producer, options: KafkaProducerOptions, serializerFactory: IRawMessageSerializerFactory, logger: ILogger) {
    this._logger = logger;
    this._serializerFactory = serializerFactory;
    this._options = options;

    this._kafka = kafka;
    this._producer = producer;
  }

  private _convertIMessageToKafkaJSMessage(msg: IMessage): KafkaJS.Message{
    const rawMessage = this._serializerFactory.serialize(msg);
    const outpuMsg: KafkaJS.Message = {
      key: rawMessage.key,
      timestamp: rawMessage.timestamp ? rawMessage.timestamp.toString() : undefined,
      partition: rawMessage.partition || undefined,
      value: rawMessage.value as Buffer<ArrayBufferLike>,
      headers: undefined
    }

    if(rawMessage.headers){
      outpuMsg.headers = {};
      for(const header of rawMessage.headers){
        for(const k of Object.keys(header)){
          outpuMsg.headers![k] = header[k];
        }
      }
    }

    return outpuMsg;
  }

  private _convertIMessageArrayToTopicMessages(messages: IMessage | IMessage[]): KafkaJS.TopicMessages[]{
    if(!Array.isArray(messages)) messages = [messages];

    const retTopicMessages: KafkaJS.TopicMessages[] = [];

    for (const msg of messages) {
      let topicMsg = this._convertIMessageToKafkaJSMessage(msg);
      let topic = retTopicMessages.find(tp => tp.topic === msg.msgTopic);
      if(!topic){
        topic = {topic: msg.msgTopic, messages: [topicMsg]};
        retTopicMessages.push(topic);
      }else{
        topic.messages.push(topicMsg);
      }
    }

    return retTopicMessages;
  }

  async send(message: IMessage | IMessage[]): Promise<void> {
    const topicMessages = this._convertIMessageArrayToTopicMessages(message);

    // eslint-disable-next-line
    this._producer.sendBatch({topicMessages});

    this._logger?.debug(`${this.constructor.name} - send completed`);
  }

  async sendWithAck(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]>{
    const topicMessages = this._convertIMessageArrayToTopicMessages(message);

    const acks:KafkaJS.RecordMetadata[]  = await this._producer.sendBatch({topicMessages});

    const resIMessageProducerSendAcks: IMessageProducerAcks[] = acks.map(item=>{
      const sentTopicMsg = topicMessages.find(tm=>tm.topic === item.topicName);

      return {
        topic: item.topicName,
        partition: item.partition,
        lastMsgOffset: Number(item.baseOffset) + (sentTopicMsg ? sentTopicMsg.messages.length : 0)
      }
    });

    //this._logger?.debug(`${this.constructor.name} - send completed - ret is: ${JSON.stringify(resIMessageProducerSendAcks, null, 2)}`);

    return resIMessageProducerSendAcks;
  }

  async createTopics(topics:string[]): Promise<void>{
    const admin = this._producer.dependentAdmin();
    await admin.connect();

    const res = await admin.createTopics({
      topics: topics.map(t=>({topic: t, numPartitions: 3, replicationFactor:2}))
    });
    this._logger?.debug(`${this.constructor.name} - createTopics completed - result: ${JSON.stringify(res, null, 2)}`);
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

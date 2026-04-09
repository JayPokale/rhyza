/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */

import {KafkaJS} from '@confluentinc/kafka-javascript';
import {
  IRawAuthenticationOptions,
} from '../raw-types';
import {
  ILogger,
  IMessage,
  IMessageProducer,
  IMessageProducerAcks,
  IRawMessage,
  IRawMessageProducer, IRawMessageSerializerFactory,
} from 'common-types-lib';

export enum KafkaProducerCompressionCodecs {
  NONE = 'none',
  GZIP = 'gzip',
  SNAPPY = 'snappy',
  LZ4 = 'lz4',
  ZSTD = 'zstd'
}

export enum KafkaProducerPartitioner {
  RANDOM = 'random',
  MURMUR2 = 'murmur2',
  MURMUR2_RANDOM = 'murmur2_random'
  // We'll only use these for now, so no need to add others and couple it even further
  // Better to use "murmur2*" algorithms family instead of the "consistent*" for consistency across stacks
}

export class KafkaProducerOptions {
  kafkaBrokerList!: string;
  producerClientId?: string;
  skipAcknowledgements?: boolean;
  messageMaxBytes?: number;
  compressionCodec?: KafkaProducerCompressionCodecs;
  partitioner?: KafkaProducerPartitioner;
  queueBufferingMaxMs?: number;
  queueBufferingMaxMessages?: number;
  authentication?: IRawAuthenticationOptions;
}


export class KafkaProducer implements IMessageProducer {
  private readonly _logger: ILogger;
  private readonly _options: KafkaProducerOptions;
  private readonly _globalConfig: KafkaJS.CommonConstructorConfig;
  private readonly _producerConfig: KafkaJS.ProducerConstructorConfig;
  private readonly _producer: KafkaJS.Producer;
  private readonly _kafka:KafkaJS.Kafka;
  private readonly _serializerFactory: IRawMessageSerializerFactory;

  constructor(options: KafkaProducerOptions, serializerFactory: IRawMessageSerializerFactory, logger: ILogger) {
    this._logger = logger;
    this._serializerFactory = serializerFactory;
    this._options = options;

    this._globalConfig = {};
    this._producerConfig = {};

    this._convertConfigs();

    this._kafka = new KafkaJS.Kafka(this._globalConfig);
    this._producer = this._kafka.producer(this._producerConfig);
  }

  private _convertConfigs(): void {
    this._globalConfig["metadata.broker.list"] = this._options.kafkaBrokerList;
    this._globalConfig["client.id"] = this._options.producerClientId;

    if (this._options.skipAcknowledgements !== undefined) {
      this._producerConfig["acks"] = this._options.skipAcknowledgements ? 0 : -1;
    }else{
      this._producerConfig["acks"] = -1; // the default is to require acknowledgements
    }

    if (this._options.messageMaxBytes !== undefined) {
      this._globalConfig["message.max.bytes"] = this._options.messageMaxBytes;
    }

    if (this._options.queueBufferingMaxMs !== undefined) {
      this._producerConfig['queue.buffering.max.ms'] = this._options.queueBufferingMaxMs;
    }

    if (this._options.queueBufferingMaxMessages !== undefined) {
      this._producerConfig['queue.buffering.max.messages'] = this._options.queueBufferingMaxMessages;
    }

    if (this._options.compressionCodec !== undefined) {
      this._producerConfig["compression.codec"] = this._options.compressionCodec;
    }

    // authentication options
    if (this._options.authentication !== undefined) {
      this._globalConfig["security.protocol"] = this._options.authentication.protocol;
      this._globalConfig["sasl.mechanism"] = this._options.authentication.mechanism;
      this._globalConfig["sasl.username"] = this._options.authentication.username;
      this._globalConfig["sasl.password"] = this._options.authentication.password;
    }

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

import { KafkaJS } from '@confluentinc/kafka-javascript';
import { ILogger, IMessage, IMessageProducer, IMessageProducerAcks } from 'common-types-lib';
import { RafikiKafkaRawProducerOptions } from '../node-rdkafka-raw/rdkafka-raw-producer';
import { CompressionTypes } from '@confluentinc/kafka-javascript/types/kafkajs';

export class KafkaJavascriptJsonProducer implements IMessageProducer {
    private readonly _logger: ILogger;
    private readonly _options: RafikiKafkaRawProducerOptions;
    private readonly _globalConfig: KafkaJS.CommonConstructorConfig;
    private readonly _producerConfig: KafkaJS.ProducerConfig;
    private readonly _producer: KafkaJS.Producer;
    private readonly _kafka:KafkaJS.Kafka;

    constructor(options: RafikiKafkaRawProducerOptions, logger: ILogger) {
        this._logger = logger;
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

        if (this._options.skipAcknowledgements != undefined) {
            this._producerConfig["acks"] = this._options.skipAcknowledgements ? 0 : 1;
        }

        if (this._options.messageMaxBytes !== undefined) {
            this._globalConfig["message.max.bytes"] = this._options.messageMaxBytes;
        }

        if (this._options.compressionCodec !== undefined) {
            this._producerConfig["compression"] = this._options.compressionCodec as unknown as CompressionTypes.Snappy;
        }

        // authentication options
        if (this._options.authentication != undefined) {
            this._globalConfig["security.protocol"] = this._options.authentication.protocol;
            this._globalConfig["sasl.mechanism"] = this._options.authentication.mechanism;
            this._globalConfig["sasl.username"] = this._options.authentication.username;
            this._globalConfig["sasl.password"] = this._options.authentication.password;
        }

    }

    private _convertIMessageToKafkaJSMessage(msg: IMessage): KafkaJS.Message{
      return {
          key: msg.msgKey,
          timestamp: msg.msgTimestamp ? msg.msgTimestamp.toString() : undefined,
          partition: msg.msgPartition || undefined,
          value: JSON.stringify(msg),
          headers: undefined
        };
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
        //this._logger?.debug(`${this.constructor.name} - send called with...`);
        const topicMessages = this._convertIMessageArrayToTopicMessages(message);

        const reportPromises = await this._producer.sendBatch({topicMessages});

        const res = await Promise.all(reportPromises);
        // this._logger?.debug(`${this.constructor.name} - send completed - result: ${JSON.stringify(res, null, 2)}`);
    }

    async sendWithAck(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]>{
        // this._logger?.debug(`${this.constructor.name} - send called with...`);
        const topicMessages = this._convertIMessageArrayToTopicMessages(message);

        const acks:KafkaJS.RecordMetadata[]  = await this._producer.sendBatch({topicMessages});

        //this._logger?.debug(`${this.constructor.name} - send completed - acks is: ${JSON.stringify(acks, null, 2)}`);

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

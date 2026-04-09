import {KafkaJS, TopicPartition} from "@confluentinc/kafka-javascript";
import { ILogger, IRawMessage, IRawMessageConsumer } from 'common-types-lib';
import {
  RafikiKafkaRawConsumerOptions,
  RafikiKafkaRawConsumerOutputType
} from '../node-rdkafka-raw/rdkafka-raw-consumer';


const defaultOptions = {
    useSyncCommit: false,
    batchSize: 1,
    batchTimeoutMs: 200,
};

export class KafkaJavascriptProtobufConsumer implements IRawMessageConsumer {
    private readonly _logger: ILogger | null;
    private readonly _options: RafikiKafkaRawConsumerOptions;
    private readonly _globalConfig: KafkaJS.CommonConstructorConfig;
    private readonly _consumerConfig: KafkaJS.ConsumerConstructorConfig;
    private readonly _consumer: KafkaJS.Consumer;
    private readonly _kafka:KafkaJS.Kafka;
    private _topics: string[] = [];

    private _handlerCallback: ((message: IRawMessage) => Promise<void>) | null;
    private _batchHandlerCallback: ((messages: IRawMessage[]) => Promise<void>) | null;
    private _rebalanceCallback: ((assignments: TopicPartition[]) => Promise<void>) | null;
    private _batchSize = defaultOptions.batchSize;

    constructor(options: RafikiKafkaRawConsumerOptions, logger: ILogger | null = null) {
        this._logger = logger;
        this._options = options;

        this._handlerCallback = null;
        this._batchHandlerCallback = null;
        this._rebalanceCallback = null;

        this._globalConfig = {};
        this._consumerConfig = {};

        this._convertConfigs();

        this._kafka = new KafkaJS.Kafka(this._globalConfig);

        this._consumer = this._kafka.consumer(this._consumerConfig);

        this._logger?.info(`${this.constructor.name} created`);
    }

    private _convertConfigs(): void {
        // mandatory
        this._globalConfig["metadata.broker.list"] = this._options.kafkaBrokerList;
        this._globalConfig["client.id"] = this._options.consumerClientId;
        // we want to always receive the rebalance events
        this._consumerConfig.rebalance_cb = this._rebalanceCallbackWrapper.bind(this);
        // we want to always receive the event events
        this._globalConfig.event_cb = true;

        // apply local defaults - if not provided by options
        if (this._options.useSyncCommit === undefined) {
            this._options.useSyncCommit = defaultOptions.useSyncCommit;
        }

        if (this._options.outputType === undefined) {
            this._options.outputType =  RafikiKafkaRawConsumerOutputType.Raw;
        }

        if (this._options.batchSize === undefined) {
            this._options.batchSize = defaultOptions.batchSize;
        }

        if (this._options.autoOffsetReset === undefined) {
            this._options.autoOffsetReset = "latest";
        }

        if (this._options.batchTimeoutMs === undefined) {
            this._options.batchTimeoutMs = defaultOptions.batchTimeoutMs;
        }

        // apply rddkafka required
        if (this._options.consumerClientId !== undefined) {
            this._globalConfig["client.id"] = this._options.consumerClientId;
        }

        if (this._options.messageMaxBytes !== undefined) {
            this._globalConfig["message.max.bytes"] = this._options.messageMaxBytes;
        }

        if (this._options.sessionTimeoutMs !== undefined) {
            this._consumerConfig["session.timeout.ms"] = this._options.sessionTimeoutMs;
        }

        // group.id is required, if not provided, generate a random one
        this._consumerConfig["group.id"] =
            this._options.kafkaGroupId || crypto.randomUUID();

        // topic configs
        this._consumerConfig["auto.offset.reset"] = this._options.autoOffsetReset;

        // global client options
        this._globalConfig["metadata.broker.list"] = this._options.kafkaBrokerList;
        this._consumerConfig["fetch.wait.max.ms"] = this._options.batchTimeoutMs;

        if (this._options.fetchErrorBackoffMms != undefined) {
            this._consumerConfig["fetch.error.backoff.ms"] =
                this._options.fetchErrorBackoffMms;
        }

        // authentication options
        if (this._options.authentication != undefined) {
            this._globalConfig["security.protocol"] = this._options.authentication.protocol;
            this._globalConfig["sasl.mechanism"] = this._options.authentication.mechanism;
            this._globalConfig["sasl.username"] = this._options.authentication.username;
            this._globalConfig["sasl.password"] = this._options.authentication.password;
        }
        // apply local defaults
        this._batchSize = this._options.batchSize;
    }

    private _rebalanceCallbackWrapper(err:KafkaJS.KafkaJSError, assignment: TopicPartition[]): Promise<void> {
        switch (err.code) {
            case KafkaJS.ErrorCodes.ERR__ASSIGN_PARTITIONS:
                this._logger?.info(`Assigned partitions ${JSON.stringify(assignment)}`);
                break;
            case KafkaJS.ErrorCodes.ERR__REVOKE_PARTITIONS:
                this._logger?.info(`Revoked partitions ${JSON.stringify(assignment)}`);
                break;
            default:
                this._logger?.error(err);
        }

        if (this._rebalanceCallback) {
            return this._rebalanceCallback(assignment);
        }
        return Promise.resolve();
    }

    private _formatMessage(kafkaMsg: KafkaJS.KafkaMessage, topic: string, partition: number): IRawMessage {
        let retMsg:IRawMessage = {
            topic: topic,
            partition: partition,
            offset: Number(kafkaMsg.offset),
            key: kafkaMsg.key ? kafkaMsg.key.toString() : null,
            timestamp: Number(kafkaMsg.timestamp),
            value: kafkaMsg.value || null,
            headers: null
        }

        // parse headers
        if(kafkaMsg.headers != null && Object.keys(kafkaMsg.headers).length > 0){
            retMsg.headers = [];
            for(const k of Object.keys(kafkaMsg.headers)){
                if(kafkaMsg.headers[k] != null) {
                    retMsg.headers.push({[k]: kafkaMsg.headers[k].toString()});
                }
            }
        }

        return retMsg;
    }


    setCallbackFn(handlerCallback: (message: IRawMessage) => Promise<void>): void {
        throw new Error("Method not implemented, must use setBatchCallbackFn() instead");
    }

    setBatchCallbackFn(batchHandlerCallback: (messages: IRawMessage[]) => Promise<void>): void {
        this._batchHandlerCallback = batchHandlerCallback;
    }

    setTopics(topics: string[]): void {
        this._topics = topics
    }

    setBatchSize(size: number): void {
        this._batchSize = size
    }

    async destroy(force: boolean): Promise<void> {
        this._logger?.info("RafikiKafkaProducer - destroy called...");
        return await this.disconnect();
    }

    async connect(): Promise<void> {

        await this._consumer.connect();
        // get metadata?

        this._logger?.info(`${this.constructor.name} - connected.`);
    }

    async disconnect(force: boolean = false): Promise<void> {
        await this._consumer.disconnect();
        this._logger?.info(`${this.constructor.name} - disconnected.`);
    }

    async start(): Promise<void> {
        await this._consumer.subscribe({topics: this._topics});

        await this._consumer.run({eachBatch: async (batchPayload:KafkaJS.EachBatchPayload) => {
            this._logger?.debug(`Got batch with ${batchPayload.batch.messages.length} messages from topic ${batchPayload.batch.topic} partition ${batchPayload.batch.partition} first offset ${batchPayload.batch.firstOffset()} last offset ${batchPayload.batch.lastOffset()}`);

            // Shouldn't happen, for debug
            if (batchPayload.batch.isEmpty() || batchPayload.batch.messages.length <= 0) {
                return;
            }

            const msgs = batchPayload.batch.messages.map(
                m=>this._formatMessage(m, batchPayload.batch.topic, batchPayload.batch.partition)
            );

            // call the provided handler and then commit
            if (this._batchHandlerCallback) {
                await this._batchHandlerCallback(msgs)
            }

            if (this._consumerConfig["enable.auto.commit"] === true) return;

            await this._consumer.commitOffsets(batchPayload.batch.messages.map(msg => {
                return {
                    topic: batchPayload.batch.topic,
                    partition: batchPayload.batch.partition,
                    offset: msg.offset.toString()
                };
            }));
        }});
    }

    startAndWaitForRebalance(): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async stop(): Promise<void> {
        this._consumer.paused();
    }



}

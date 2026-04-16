import {Metadata, RdKafka, TopicPartition} from "@confluentinc/kafka-javascript";
import {IMessageConsumer, IRawMessage, ILogger, IRawMessageSerializerFactory, IMessage} from 'common-types-lib';
import {KafkaConsumerOptions} from "./types";
import {KafkaUtil} from "./kafka-util";

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_BATCH_TIMEOUT_MS = 50;

export type rebalanceCallback = (type: 'error' | 'assign' | 'revoke' , assignments?: { topic: string; partition: number }[], error?:Error) => Promise<void>;
export type messageHandlerCallback = (messages: IMessage[]) => Promise<void>;

export class KafkaLowLevelConsumer implements IMessageConsumer{
  private readonly _logger: ILogger | null;
  private readonly _consumer: RdKafka.KafkaConsumer;
  private readonly _serializerFactory: IRawMessageSerializerFactory;
  private readonly _globalConfig: RdKafka.ConsumerGlobalConfig = {};

  private _topics: string[] = [];
  private _batchHandlerCallback: messageHandlerCallback | null = null;
  private _rebalanceCallback: rebalanceCallback | null = null;
  private _batchSize: number;
  private _batchTimeoutMs: number;
  private _consuming = false;

  constructor(
    globalConfigs: RdKafka.ConsumerGlobalConfig,
    consumerConfigs: KafkaConsumerOptions,
    serializerFactory: IRawMessageSerializerFactory,
    logger:ILogger | null = null
  ) {
    this._logger = logger;
    this._globalConfig = globalConfigs;
    this._serializerFactory = serializerFactory;
    this._batchSize = consumerConfigs.batchSize ?? DEFAULT_BATCH_SIZE;
    this._batchTimeoutMs = consumerConfigs.batchTimeoutMs ?? DEFAULT_BATCH_TIMEOUT_MS;

    this._consumer = new RdKafka.KafkaConsumer(
      {
        ...globalConfigs,
        "group.id": consumerConfigs.consumerGroupId,
        "enable.auto.commit": false, // we do it manually
        "fetch.wait.max.ms": this._batchTimeoutMs,
        rebalance_cb: true,
        event_cb: true,
      },
      {
        "auto.offset.reset": consumerConfigs.autoOffsetReset ?? 'earliest'

      }
    );
    this._consumer.setDefaultConsumeTimeout(this._batchTimeoutMs);

    this._consumer.on('rebalance', this._onRebalance.bind(this));
    this._consumer.on('rebalance.error', this._onRebalanceError.bind(this));
    this._consumer.on("event.event", this._onEvent.bind(this));
    this._consumer.on('event.error', this._onError.bind(this));
    this._consumer.on('disconnected', this._onDisconnect.bind(this));
  }

  /* istanbul ignore next */
  private _onError(error: RdKafka.LibrdKafkaError): void {
    this._logger?.error(error.message, error);
  }

  /* istanbul ignore next */
  private _onEvent(eventData: any): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this._logger?.debug(`KafkaLowLevelConsumer - event.event - ${JSON.stringify(eventData, null, 2)}`);
  }

  /* istanbul ignore next */
  private _onRebalance(error: RdKafka.LibrdKafkaError, assignments: TopicPartition[]) {
    if (error &&error.code != -175 && error.code !== -174) {
      // Ignore rebalance errors (other error codes), these will emit a dedicated the "rebalance.error"
      return;
    }

    // rdkafka library code emits the event as it receives it from the cluster and
    // before actually calling the assign() or unassign(), we need to wait a bit
    // half a second is enough and this is not a performance issue
    // https://github.com/Blizzard/node-rdkafka/blob/aba2011d6c1ae2a0ae745b5d71bef77aa42180cc/lib/kafka-consumer.js#L59
    setTimeout(async () => {
      this._logger?.debug(
        `KafkaLowLevelConsumer - event.rebalance - ${JSON.stringify(
          assignments,
          null,
          2
        )}`
      );

      if(!this._rebalanceCallback) {
        return;
      }

      const type = error.code == -175 ? 'assign' : 'revoke';
      await this._rebalanceCallback(type, assignments);
    }, 500);
  }

  /* istanbul ignore next */
  private _onRebalanceError(error: Error) {
    // same as above in _onRebalance()
    setTimeout(async () => {
      this._logger?.warn(
        `KafkaLowLevelConsumer - event.rebalance error - ${JSON.stringify(
          error,
          null,
          2
        )}`
      );
      if(!this._rebalanceCallback) {
        return;
      }

      await this._rebalanceCallback('error', undefined, error);
    }, 500);
  }

  private _onDisconnect(metrics: RdKafka.ClientMetrics): void {
    /* istanbul ignore else */
    if (metrics?.connectionOpened) {
      this._logger?.info(
        `KafkaLowLevelConsumer - event.disconnected - connected for ${
          (Date.now() - metrics.connectionOpened) / 1000
        } secs`
      );
    } else {
      this._logger?.info(
        `KafkaLowLevelConsumer - event.disconnected - ${JSON.stringify(
          metrics,
          null,
          2
        )}`
      );
    }

  }

  private async _fetchBatch(): Promise<RdKafka.Message[]> {
    return new Promise((resolve, reject) => {
      this._consumer.consume(this._batchSize, (err, messages) => {
        if (err) {
          return reject(err);
        }
        resolve(messages);
      });
    });
  }

  private async _consumeLoop(): Promise<void> {
    if (!this._consumer.isConnected()) throw new Error('Kafka consumer not connected');
    if(this._consuming) {
      this._logger?.warn(`${this.constructor.name} - consume loop already running, skipping`);
      return;
    }

    if(!this._batchHandlerCallback) {
      throw new Error(`${this.constructor.name} - batchHandlerCallback not set, cannot consume`);
    }

    this._consuming = true;
    this._logger?.info(`${this.constructor.name} - starting consume loop with batch size ${this._batchSize} and timeout ${this._batchTimeoutMs}ms`);


    while (this._consuming) {
      const start = Date.now();
      const kafkaMessages = await this._fetchBatch();
      const afterFetch = Date.now();

      if (kafkaMessages.length <= 0) {
        // // No messages? Wait a bit before polling again to save CPU
        // const waitMs = this._batchTimeoutMs - (Date.now() - afterFetch);
        // if(waitMs > 0) {
        //   await new Promise((resolve) => setTimeout(resolve, waitMs));
        // }
        continue;
      }

      // const msgs = kafkaMessages.map(this._toIMessage.bind(this));
      const msgs = kafkaMessages.map(msg => this._serializerFactory.deserialize(
        KafkaUtil.convertFromKafkaMsg(msg, msg.topic, msg.partition)
      ));
      const beforeHander = Date.now();
      await this._batchHandlerCallback(msgs);
      const handlerTook = Date.now()-beforeHander;

      // Commit offsets after successful processing
      const beforeCommit = Date.now();
      this._consumer.commit();
      const afterCommit = Date.now();
      this._logger?.debug(`Consume cycle took:  ${afterCommit - start}ms - fetch: ${afterFetch - start}ms - handler: ${handlerTook}ms - commit: ${afterCommit - beforeCommit}ms`);
    }
  }

  setCallbackFn(handlerCallback: (message: IMessage) => Promise<void>): void {
    throw new Error('setCallbackFn is not supported for KafkaLowLevelConsumer');
  }

  setBatchCallbackFn(batchHandlerCallback: (messages: IMessage[]) => Promise<void>): void {
    this._batchHandlerCallback = batchHandlerCallback;
  }

  setTopics(topics: string[]): void {
    this._topics = topics;
  }

  async destroy(force: boolean): Promise<void> {
    this._logger?.info('RafikiKafkaProducer - destroy called...');
    return await this.disconnect();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._consumer.connect({}, async (err: RdKafka.LibrdKafkaError, metadata: RdKafka.Metadata) => {
          /* istanbul ignore if */
          if (err) {
            this._logger?.error('KafkaLowLevelConsumer - error connecting to cluster',err);
            return reject(new Error(`KafkaLowLevelConsumer - error connecting to cluster: ${err.message}`));
          }

           if(!this._topics.length) {
            throw new Error('No topics specified for Kafka consumer');
          }

          // throw if topics not found in metadata
          this._topics.forEach((topicName) => {
            this._logger?.debug(`KafkaLowLevelConsumer - checking if topic '${topicName}' exists in kafka...`, metadata);
            const found = metadata.topics.find(
              (value) => value.name.toUpperCase() === topicName.toUpperCase()
            );
            if (!found) {
              throw new Error(`Topic ${topicName} not found in kafka, cannot continue`);
            }
          });

          // metadata is handled by the onReady event
          this._logger?.info('KafkaLowLevelConsumer - connected!');
          resolve();
        }
      );
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._logger?.info('KafkaLowLevelConsumer - disconnect called...');
      if (!this._consumer.isConnected()) {
        this._logger?.warn('KafkaLowLevelConsumer - disconnect called but consumer is not connected');
        return resolve();
      }

      this._consumer.disconnect((err: any, _data: RdKafka.ClientMetrics) => {
        /* istanbul ignore if */
        if (err) {
          this._logger?.error('KafkaLowLevelConsumer - disconnect failed', err);
          return reject(err);
        }
        this._logger?.info('KafkaLowLevelConsumer - disconnected.');
        resolve();
      });
    });
  }

  startAndWaitForRebalance(): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      this._consumer.prependOnceListener("rebalance", (error: RdKafka.LibrdKafkaError, assignments: TopicPartition[]) => {
        if (error.code != RdKafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS || !assignments || assignments.length == 0) {
          throw new Error("KafkaLowLevelConsumer - didnt get an assign on first rebalance event (startAndWaitForRebalance)");
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this._logger?.info("KafkaLowLevelConsumer - got rebalance on startAndWaitForRebalance()");
        setImmediate(() => {
          this._consumeLoop();
        });
        resolve();
      });

    // manually reject (so we don't lose this because of the async executor function
      await this.start().catch(reason => reject(reason));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(this._topics) || this._topics.length == 0) {
        this._logger?.warn('KafkaLowLevelConsumer - no topics subscribed on start()');
        resolve();
        return;
      }

      this._consumer.prependOnceListener('subscribed', async (topics) => {
        this._logger?.info('KafkaLowLevelConsumer - subscribed');
        setImmediate(() => {
          this._consumeLoop();
        });
        resolve();
      });

      this._logger?.info(`KafkaLowLevelConsumer - Subscribing to topics ${JSON.stringify(this._topics)}`);
      this._consumer.subscribe(this._topics);
    });
  }

  async stop(): Promise<void> {
    this._consumer.unsubscribe();
    this._logger?.info('KafkaLowLevelConsumer - stop called, unsubscribed from previously subscribed topics');
  }

  setFilteringFn(filterFn: (message: IMessage) => boolean): void {
    throw new Error("Method not implemented.");
  }

  setBatchSize(size: number): void {
    this._batchSize = size;
  }

  private async _getMetadata(): Promise<RdKafka.Metadata> {
    return new Promise<RdKafka.Metadata>((resolve, reject) => {
      this._consumer.getMetadata(
        { allTopics: true },
        (err: RdKafka.LibrdKafkaError, data: Metadata) => {
          if (err) {
            this._logger?.error(
              `KafkaLowLevelConsumer - error requesting metadata from RdKaf client - error-no: ${err.errno} message: ${err.message}`,
              err
            );
            return reject(err);
          }
          return resolve(data);
        }
      );
    });
  }
}

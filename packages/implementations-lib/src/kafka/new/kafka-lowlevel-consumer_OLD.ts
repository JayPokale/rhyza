import {Metadata, RdKafka, TopicPartition} from "@confluentinc/kafka-javascript";
import {IMessageConsumer, IRawMessage, ILogger, IRawMessageSerializerFactory, IMessage} from 'common-types-lib';
import { EventEmitter } from 'events';
import {KafkaAuthenticationOptions} from "./types";

type KafkaLowLevelConsumerEvents = 'rebalance';
type KafkaLowLevelConsumerEventListenerMap = {
  rebalance: (
    type: 'assign' | 'revoke',
    assignments: { topic: string; partition: number }[]
  ) => void;
};
type KafkaLowLevelConsumerEventListener<K extends string> =
  K extends keyof KafkaLowLevelConsumerEventListenerMap
    ? KafkaLowLevelConsumerEventListenerMap[K]
    : never;

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_USE_SYNC_COMMIT = true;

export class KafkaLowLevelConsumerOLD extends EventEmitter implements IMessageConsumer{
  private readonly _logger: ILogger | null;
  private readonly _consumer: RdKafka.KafkaConsumer;
  private readonly _serializerFactory: IRawMessageSerializerFactory;
  private readonly _globalConfig: RdKafka.ConsumerGlobalConfig = {};
  private readonly _topicConfig: RdKafka.ConsumerTopicConfig = {};
  private readonly _useSyncCommit: boolean = DEFAULT_USE_SYNC_COMMIT;
  private _topics: string[] = [];
  private _batchHandlerCallback: ((messages: IMessage[]) => Promise<void>) | null = null;
  private _batchSize: number = DEFAULT_BATCH_SIZE;

  constructor(
    globalConfigs: RdKafka.ConsumerGlobalConfig, topicConfig: RdKafka.ConsumerTopicConfig,
    serializerFactory: IRawMessageSerializerFactory,
    useSyncCommit?: boolean, batchSize?: number,
    logger:ILogger | null = null,
  ) {
    super();
    this._logger = logger;
    this._globalConfig = globalConfigs;
    this._topicConfig = topicConfig;
    this._serializerFactory = serializerFactory;

    this._consumer = new RdKafka.KafkaConsumer(
      this._globalConfig,
      this._topicConfig
    );

    if(useSyncCommit) this._useSyncCommit = useSyncCommit;
    if(batchSize) this._batchSize = batchSize;

    this._consumer.on('ready', this._onReady.bind(this));
    this._consumer.on('rebalance', this._onRebalance.bind(this));
    this._consumer.on('rebalance.error', this._onRebalanceError.bind(this));
    this._consumer.on('event.event', this._onEvent.bind(this));
    this._consumer.on('event.log', this._onLog.bind(this));
    this._consumer.on('event.error', this._onError.bind(this));
    this._consumer.on('event.throttle', this._onThrottle.bind(this));
    this._consumer.on('event.stats', this._onStats.bind(this));
    this._consumer.on('disconnected', this._onDisconnect.bind(this));
  }


  private _onReady(info: RdKafka.ReadyInfo, metadata: RdKafka.Metadata): void {
    this._logger?.info(
      `RafikiRawKafkaConsumer - event.ready - info: ${JSON.stringify(
        info,
        null,
        2
      )}`
    );

    this._logger?.debug('RafikiRawKafkaConsumer - event.ready - metadata');
    // this a huge
    /*this._logger?.debug(
      `RafikiRawKafkaConsumer - event.ready - metadata: ${JSON.stringify(
        metadata,
        null,
        2
      )}`
    );*/
    setImmediate(() => {
      this.emit('ready', info, metadata);
    });
  }

  /* istanbul ignore next */
  private _onError(error: RdKafka.LibrdKafkaError): void {
    this._logger?.error(error.message, error);
  }

  /* istanbul ignore next */
  private _onRebalance(error: RdKafka.LibrdKafkaError, assignments: TopicPartition[]) {
    if (
      error &&
      error.code != -175 /*ERR__ASSIGN_PARTITIONS*/ &&
      error.code !== -174 /*ERR__REVOKE_PARTITIONS*/
    ) {
      // Ignore rebalance errors (other error codes), these will emit a dedicated the "rebalance.error"
      return;
    }

    // rdkafka library code emits the event as it receives it from the cluster and
    // before actually calling the assign() or unassign(), we need to wait a bit
    // half a second is enough and this is not a performance issue
    // https://github.com/Blizzard/node-rdkafka/blob/aba2011d6c1ae2a0ae745b5d71bef77aa42180cc/lib/kafka-consumer.js#L59
    setTimeout(() => {
      this._logger?.debug(
        `RafikiRawKafkaConsumer - event.rebalance - ${JSON.stringify(
          assignments,
          null,
          2
        )}`
      );
      const type = error.code == -175 ? 'assign' : 'revoke';
      this.emit('rebalance', type, assignments);
    }, 500);
  }

  /* istanbul ignore next */
  private _onRebalanceError(error: Error) {
    // same as above in _onRebalance()
    setTimeout(() => {
      this._logger?.warn(
        `RafikiRawKafkaConsumer - event.rebalance error - ${JSON.stringify(
          error,
          null,
          2
        )}`
      );
      this.emit('rebalance.error', error);
    }, 500);
  }

  /* istanbul ignore next */
  private _onEvent(eventData: any): void {
    this._logger?.debug(
      `RafikiRawKafkaConsumer - event.event - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
    this.emit('event', eventData);
  }

  /* istanbul ignore next */
  private _onThrottle(eventData: any): void {
    this._logger?.warn(
      `RafikiRawKafkaConsumer - event.throttle - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
    this.emit('throttle', eventData);
  }

  /* istanbul ignore next */
  private _onLog(eventData: any): void {
    this._logger?.debug(
      `RafikiRawKafkaConsumer - event.log - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
  }

  /* istanbul ignore next */
  private _onStats(eventData: any): void {
    this._logger?.debug(
      `RafikiRawKafkaConsumer - event.stats - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
    this.emit('stats', eventData);
  }

  private _onDisconnect(metrics: RdKafka.ClientMetrics): void {
    /* istanbul ignore else */
    if (metrics?.connectionOpened) {
      this._logger?.info(
        `RafikiRawKafkaConsumer - event.disconnected - connected for ${
          (Date.now() - metrics.connectionOpened) / 1000
        } secs`
      );
    } else {
      this._logger?.info(
        `RafikiRawKafkaConsumer - event.disconnected - ${JSON.stringify(
          metrics,
          null,
          2
        )}`
      );
    }
    this.emit('disconnected');
  }

  private _consuming = false;

  private _consumeLoop(): void {
    if (!this._consumer.isConnected() || this._consuming) return;

    const callContinue = () => {
      setImmediate(() => {
        this._consuming = false;
        this._consumeLoop();
      });
    };

    this._consuming = true;
    this._consumer.consume(
      this._batchSize,
      (err: RdKafka.LibrdKafkaError, kafkaMessages: RdKafka.Message[]) => {
        if (err) {
          // ignore not connected or wrong state, or unknown topic or partition
          if (
            !this._consumer.isConnected() ||
            err.code == RdKafka.CODES.ERRORS.ERR__STATE ||
            err.code == RdKafka.CODES.ERRORS.ERR_UNKNOWN_TOPIC_OR_PART
          )
            return;
          this._logger?.error(
            `KafkaLowLevelConsumer got callback with err: ${err.message}`,
            err
          );
          return callContinue();
        }

        // Shouldn't happen, but if it does we don't hang the consume loop
        if (kafkaMessages.length <= 0 || !this._batchHandlerCallback) return callContinue();
        const msgs = kafkaMessages.map(this._toIMessage.bind(this));

        // call the provided handler and then commit
        this._batchHandlerCallback(msgs).finally(() => {
          this._commitMsg(kafkaMessages);
          return callContinue();
        });
      }
    );
  }

  private _toIMessage(kafkaMsg: RdKafka.Message): IMessage {
    let retMsg:IRawMessage = {
      topic: kafkaMsg.topic,
      partition: kafkaMsg.partition,
      offset: kafkaMsg.offset,
      key: kafkaMsg.key ? kafkaMsg.key.toString() : null,
      timestamp: kafkaMsg.timestamp ?? null,
      value: kafkaMsg.value || null,
      headers: null
    }

    // parse msg headers
    if (kafkaMsg.headers != null) {
      retMsg.headers = [];
      kafkaMsg.headers.forEach((kafkaHeader: RdKafka.MessageHeader) => {
        // NOTE: kafka headers are key/value pairs, only one pair will ever exist per header rec
        for (const key in kafkaHeader) {
          if (!Object.prototype.hasOwnProperty.call(kafkaHeader, key)) continue;
          retMsg.headers!.push({ [key]: kafkaHeader[key].toString()});
        }
      });
    }

    return this._serializerFactory.deserialize(retMsg);
  }

  private _commitMsg(kafkaMessage: RdKafka.Message | RdKafka.Message[]): void {
    if (this._globalConfig['enable.auto.commit'] === true) return;

    if (this._useSyncCommit) {
      this._consumer.commitSync(kafkaMessage);
    } else {
      this._consumer.commit(kafkaMessage);
    }
  }

  on(event: KafkaLowLevelConsumerEvents, listener: KafkaLowLevelConsumerEventListener<KafkaLowLevelConsumerEvents>): this {
    return super.on(event, listener);
  }

  once(event: KafkaLowLevelConsumerEvents, listener: KafkaLowLevelConsumerEventListener<KafkaLowLevelConsumerEvents>): this {
    return super.once(event, listener);
  }

  setBatchSize(size: number): void {
    this._batchSize = size;
  }

  setFilteringFn(filterFn: (message: IMessage) => boolean): void {
    throw new Error("Method not implemented.");
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
      this._consumer.connect(
        {
          // topic: this._topics[0],
          // allTopics: false
        },
        (err: RdKafka.LibrdKafkaError, metadata: RdKafka.Metadata) => {
          /* istanbul ignore if */
          if (err) {
            this._logger?.error(
              'RafikiRawKafkaConsumer - error connecting to cluster',
              err
            );
            return reject(
              new Error(
                `RafikiRawKafkaConsumer - error connecting to cluster: ${err.message}`
              )
            );
          }

          // throw if topics not found in metadata
          if (this._topics) {
            this._topics.forEach((topicName) => {
              this._logger?.debug(
                `RafikiRawKafkaConsumer - checking if topic '${topicName}' exists in kafka...`,
                metadata
              );
              //this._logger?.debug(metadata);

              if (!metadata || !metadata.topics) {
                this._logger?.error('Fetching Meta-Data:');
                const fetchedMetaData = this.getMetadata();
                this._logger?.error(fetchedMetaData);
                throw new Error(
                  `Topic '${topicName}' not found in kafka, no topics found in metadata. MetaData[${metadata}]`
                );
              }
              const found = metadata.topics.find(
                (value) => value.name.toUpperCase() === topicName.toUpperCase()
              );
              if (!found) {
                throw new Error(
                  `Topic ${topicName} not found in kafka, cannot continue`
                );
              }
            });
          }
          // metadata is handled by the onReady event
          this._logger?.info('RafikiRawKafkaConsumer - connected!');
          resolve();
        }
      );
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._logger?.info('RafikiRawKafkaConsumer - disconnect called...');
      if (!this._consumer.isConnected()) {
        this._logger?.warn(
          'RafikiRawKafkaConsumer - disconnect called but consumer is not connected'
        );
        return resolve();
      }
      this._consumer.disconnect((err: any, _data: RdKafka.ClientMetrics) => {
        /* istanbul ignore if */
        if (err) {
          this._logger?.error('RafikiRawKafkaConsumer - disconnect failed', err);
          return reject(err);
        }
        this._logger?.info('RafikiRawKafkaConsumer - disconnected.');
        resolve();
      });
    });
  }

  startAndWaitForRebalance(): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      this.prependOnceListener('rebalance', (type, assignments) => {
        if (type !== 'assign') {
          throw new Error(
            'RafikiRawKafkaConsumer - got revoke in first rebalance event'
          );
        }

        this._logger?.info(
          'RafikiRawKafkaConsumer - got rebalance on startAndWaitForRebalance()'
        );
        setImmediate(() => {
          this._consumeLoop();
        });
        resolve();
      });

      // manually reject (so we don't lose this because of the async executor function
      await this.start().catch((reason) => reject(reason));
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(this._topics) || this._topics.length == 0) {
        this._logger?.warn('RafikiRawKafkaConsumer - no topics subscribed on start()');
        resolve();
        return;
      }

      this._consumer.once('subscribed', async (topics) => {
        this._logger?.info('RafikiRawKafkaConsumer - subscribed');
        setImmediate(() => {
          this._consumeLoop();
        });
        resolve();
      });

      this._logger?.info(
        `RafikiRawKafkaConsumer - Subscribing to topics ${JSON.stringify(
          this._topics
        )}`
      );
      this._consumer.subscribe(this._topics);
    });
  }

  async stop(): Promise<void> {
    this._consumer.unsubscribe();
    this._logger?.info(
      'RafikiRawKafkaConsumer - stop called, unsubscribed from previously subscribed topics'
    );
  }

  async getMetadata(): Promise<RdKafka.Metadata> {
    return new Promise<RdKafka.Metadata>((resolve, reject) => {
      this._consumer.getMetadata(
        { allTopics: true },
        (err: RdKafka.LibrdKafkaError, data: Metadata) => {
          if (err) {
            this._logger?.error(
              `RafikiRawKafkaConsumer - error requesting metadata from RdKaf client - error-no: ${err.errno} message: ${err.message}`,
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

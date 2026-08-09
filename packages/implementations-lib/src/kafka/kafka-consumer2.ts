
import {
  IMessageConsumer,
  ILogger,
  IRawMessageSerializerFactory,
  IMessage, ITelemetryService, ITelemetryHistogram, TELEMETRY_PROPS_CALL_NAME_PROP, IRawMessage
} from 'common-types-lib';

import process from "process";
import * as PlatformaticKafka from '@platformatic/kafka'
import {Duplex} from "node:stream";
import { pipeline } from 'node:stream/promises'

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_BATCH_TIMEOUT_MS = 50;

const HISTOGRAM_NAME = 'KafkaLowLevelConsumer_histo';

export type rebalanceCallback = (
  type: 'error' | 'assign' | 'revoke',
  assignments?: { topic: string; partition: number }[],
  error?: Error
) => Promise<void>;
export type messageHandlerCallback = (messages: IMessage[]) => Promise<void>;


class MessageBatcher extends Duplex {
  private _size: number;
  private _timeout: number;
  private _batch: PlatformaticKafka.Message[];
  private _batchTimeout: NodeJS.Timeout | null = null;

  constructor (size:number, timeout:number) {
    super({ objectMode: true })
    this._size = size
    this._timeout = timeout
    this._batch = []
  }

  _read () {
    // No-op - Data is pushed from the writable side
  }

  _write (chunk: PlatformaticKafka.Message, _encoding: string, callback: () => void) {
    this._batch.push(chunk)

    if (this._batch.length < this._size) {
      this._batchTimeout ??= setTimeout(() => {
        this._flush()
      }, this._timeout)
    } else {
      this._flush()
    }

    callback()
  }

  // Write side is closed, flush the remaining messages
  _final (callback: () => void) {
    this._flush()
    this.push(null) // End readable side
    callback()
  }

  private _flush () {
    if(this._batchTimeout) {
      clearTimeout(this._batchTimeout)
      this._batchTimeout = null
    }

    if (this._batch.length === 0) {
      return
    }

    this.push(this._batch)
    this._batch = []
  }
}


export class KafkaLowLevelConsumerNew2 implements IMessageConsumer {
  private readonly _logger: ILogger | null;
  private readonly _consumer: PlatformaticKafka.Consumer;
  private readonly _serializerFactory: IRawMessageSerializerFactory;
  private readonly _telemetryService: ITelemetryService | null = null;
  private readonly _histogram: ITelemetryHistogram | null = null;

  private _stream: PlatformaticKafka.MessagesStream<Buffer, Buffer, Buffer, Buffer> | null = null;

  private _topics: string[] = [];
  private _batchHandlerCallback: messageHandlerCallback | null = null;

  private _batchSize: number;
  private _batchTimeoutMs: number;

  constructor(
    clientId: string,
    groupId: string,
    brokers:string[],
    serializerFactory: IRawMessageSerializerFactory,
    logger: ILogger | null = null,
    telemetryService: ITelemetryService | null = null,
    batchSize:number = DEFAULT_BATCH_SIZE,
    batchTimeoutMs:number = DEFAULT_BATCH_TIMEOUT_MS,
  ) {
    this._logger = logger;
    this._telemetryService = telemetryService;
    this._serializerFactory = serializerFactory;
    this._batchSize = batchSize;
    this._batchTimeoutMs = batchTimeoutMs;

    if(this._telemetryService) {
      this._histogram = this._telemetryService.getHistogram(
        HISTOGRAM_NAME
      );
    }

    this._consumer = new PlatformaticKafka.Consumer(
      {
        clientId: clientId,
        bootstrapBrokers: brokers,
        groupId: groupId,
        autocommit: true,
        timeout: 60_000
      }
    );

  }


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setCallbackFn(handlerCallback: (message: IMessage) => Promise<void>): void {
    throw new Error('setCallbackFn is not supported for KafkaLowLevelConsumer');
  }

  setBatchCallbackFn(
    batchHandlerCallback: (messages: IMessage[]) => Promise<void>
  ): void {
    this._batchHandlerCallback = batchHandlerCallback;
  }

  setTopics(topics: string[]): void {
    this._topics = topics;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async destroy(force: boolean): Promise<void> {
    this._logger?.info('RafikiKafkaProducer - destroy called...');
    return await this.disconnect();
  }

  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._logger?.info('KafkaLowLevelConsumer - disconnect called...');
      if (!this._consumer.isConnected()) {
        this._logger?.warn(
          'KafkaLowLevelConsumer - disconnect called but consumer is not connected'
        );
        return resolve();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this._consumer.close((err: any) => {
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

  async startAndWaitForRebalance(): Promise<void> {
    this._logger?.info("Starting consumer...");
    this._stream = await this._consumer.consume({
      topics: this._topics, maxWaitTime: 10, mode: PlatformaticKafka.MessagesStreamModes.LATEST
    });

    let cycleStartTs:bigint, beforeDeserializeTs:bigint, beforeHandlerTs:bigint, beforeCommitTs:bigint;
    let deserializeTookNs:number,handlerTookNs:number, commitTookNs:number, cycleTookNs:number;
    let deserializedMessages: IMessage[] = [];

    const batch = new MessageBatcher(this._batchSize, this._batchTimeoutMs)
    batch.on('data', async (kafkaMessages: PlatformaticKafka.Message[]) => {
      if(!this._batchHandlerCallback){
        return;
      }

      // NOTE: we only measure when there are messages to process
      deserializedMessages.length = 0;

      cycleStartTs = process.hrtime.bigint();
      beforeDeserializeTs = process.hrtime.bigint();
      deserializedMessages = kafkaMessages.map((msg) => {
        const rawMsg: IRawMessage = {
          topic: msg.topic,
          offset: Number(msg.offset),
          partition: msg.partition,
          key: msg.key,
          value: msg.value,
          timestamp: Number(msg.timestamp),
          headers: []
        };
        if(msg.headers){
          rawMsg.headers = [];
          for (const [key, val] of msg.headers) {
            rawMsg.headers.push({[key.toString()]: val});
          }
        }

        return this._serializerFactory.deserialize(rawMsg);
      });
      deserializeTookNs = Number(process.hrtime.bigint() - beforeDeserializeTs);

      beforeHandlerTs = process.hrtime.bigint();
      await this._batchHandlerCallback(deserializedMessages);
      handlerTookNs = Number(process.hrtime.bigint() - beforeHandlerTs);

      // Commit offsets after successful processing
      beforeCommitTs = process.hrtime.bigint();
      for await (const msg of kafkaMessages) {
        await msg.commit()
      }
      commitTookNs = Number(process.hrtime.bigint() - beforeCommitTs);

      cycleTookNs = Number(process.hrtime.bigint() - cycleStartTs);

      if(this._histogram){
        this._histogram.observe(cycleTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]: 'consumeCycle'});
        //this._histogram.observe(fetchBatchTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]: 'fetchBatch'});
        this._histogram.observe(deserializeTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]: 'deserialize'});
        this._histogram.observe(handlerTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]: 'handler'});
        this._histogram.observe(commitTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]: 'commit'});
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      this._logger?.isDebugEnabled() && this._logger?.debug(
        `Consume cycle took:  ${Math.round(cycleTookNs/1e+6)}ms - parts: ${Math.round(deserializeTookNs/1e+6)}ms / ${Math.round(handlerTookNs/1e+6)}ms / ${Math.round(commitTookNs/1e+6)}ms (deserialization/handler/commit)`
      );

    });

    pipeline(this._stream, batch).then(()=>{
      this._logger?.info("Consumer Closed");
    }).catch((err)=>{
      this._logger?.error(err);
    });
    this._logger?.info("Consumer Started");
  }

  start(): Promise<void> {
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    if(this._stream) {
      await this._stream.close();
    }

    await this._consumer.close();
    this._logger?.info(
      'KafkaLowLevelConsumer - stop called, unsubscribed from previously subscribed topics'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setFilteringFn(filterFn: (message: IMessage) => boolean): void {
    throw new Error('Method not implemented.');
  }

  setBatchSize(size: number): void {
    this._batchSize = size;
  }

}

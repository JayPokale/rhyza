'use strict';

import { EventEmitter } from 'events';
import * as RDKafka from 'node-rdkafka';
import { NumberNullUndefined } from 'node-rdkafka';
import {
  IRawAuthenticationOptions,
  IRawMessage,
  IRawMessageHeader,
  IRawMessageProducer
} from './raw_types';

import { logger } from '../../logger';

export enum RafikiKafkaRawProducerCompressionCodecs {
  NONE = 'none',
  GZIP = 'gzip',
  SNAPPY = 'snappy',
  LZ4 = 'lz4',
  ZSTD = 'zstd'
}

export enum RafikiKafkaRawProducerPartitioners {
  RANDOM = 'random',
  MURMUR2 = 'murmur2',
  MURMUR2_RANDOM = 'murmur2_random'
  // We'll only use these for now, so no need to add others and couple it even further
  // Better to use "murmur2*" algorithms family instead of the "consistent*" for consistency across stacks
}

export class RafikiKafkaRawProducerOptions {
  kafkaBrokerList!: string;
  producerClientId?: string;
  skipAcknowledgements?: boolean;
  messageMaxBytes?: number;
  compressionCodec?: RafikiKafkaRawProducerCompressionCodecs;
  compressionLevel?: number;
  partitioner?: RafikiKafkaRawProducerPartitioners;
  queueBufferingMaxMs?: number;
  authentication?: IRawAuthenticationOptions;
  // /* return -1 if partitioning failed */
  // partitionerFn?: (key:string, partitionCount:number, opaque?:any)=>number // if used will ignore the "partitioner" setting above
}

/*interface RafikiKafkaRawProducerEventListenerMap {
    "deliveryReport": (topic: string, partition: number | null, offset: number | null) => void,
    "testEvent": (testEventArg: number) => void
}*/

export class RafikiKafkaRawProducer
  extends EventEmitter
  implements IRawMessageProducer
{
  private readonly _client!: RDKafka.HighLevelProducer;
  private _globalConfig: RDKafka.ProducerGlobalConfig = {};
  private _topicConfig: RDKafka.ProducerTopicConfig = {};
  private readonly _options: RafikiKafkaRawProducerOptions;
  private _deliveryReportHandlerFn:
    | null
    | ((topic: string, partition: number, offset: number) => void) = null;

  /*    // synthetic sugar for type events
      public on<K extends keyof RafikiKafkaRawProducerEventListenerMap>(e: K, listener: RafikiKafkaRawProducerEventListenerMap[K]): this {
          return super.on(e, listener)
      }
  
      public once<K extends keyof RafikiKafkaRawProducerEventListenerMap>(e: K, listener: RafikiKafkaRawProducerEventListenerMap[K]): this {
          return super.once(e, listener)
      }
  
      public emit<K extends keyof RafikiKafkaRawProducerEventListenerMap>(event: K, ...args: Parameters<RafikiKafkaRawProducerEventListenerMap[K]>): boolean {
          return super.emit(event, ...args)
      }*/

  constructor(options: RafikiKafkaRawProducerOptions) {
    super();
    this._options = options;

    // parse options and apply defaults
    this._parseOptionsAndApplyDefault();

    this._client = new RDKafka.HighLevelProducer(
      this._globalConfig,
      this._topicConfig
    );

    // // Can't get this custom partitioner cb to be called.
    // if(this._topicConfig.partitioner_cb) {
    //     // @ts-ignore
    //     this._client._client.setPartitioner(this._topicConfig.partitioner_cb)
    // }

    this._client.on('ready', this._onReady.bind(this));
    this._client.on('event.error', this._onError.bind(this));
    this._client.on('event.throttle', this._onThrottle.bind(this));
    this._client.on('event.log', this._onLog.bind(this));
    this._client.on('event.stats', this._onStats.bind(this));
    this._client.on('disconnected', this._onDisconnect.bind(this));
    this._client.on('delivery-report', this._onDeliveryReport.bind(this));

    logger.info('RafikiRawKafkaProducer - instance created');
    logger.info(`RafikiRawKafkaProducer - features: ${RDKafka.features}`);
  }

  private _parseOptionsAndApplyDefault(): void {
    // global client options
    this._globalConfig = {
      'metadata.broker.list': this._options.kafkaBrokerList
    };
    this._topicConfig = {};

    /*if(this._options.partitionerFn){
                this._topicConfig.partitioner_cb = this._options.partitionerFn
            }else if...*/
    if (this._options.partitioner) {
      this._topicConfig.partitioner = this._options.partitioner;
    } else {
      // default partitioner
      this._topicConfig.partitioner =
        RafikiKafkaRawProducerPartitioners.MURMUR2_RANDOM;
    }

    if (this._options.producerClientId !== undefined) {
      this._globalConfig['client.id'] = this._options.producerClientId;
    }

    if (this._options.skipAcknowledgements === true) {
      this._topicConfig['request.required.acks'] = 0;
    }

    if (this._options.messageMaxBytes !== undefined) {
      this._globalConfig['message.max.bytes'] = this._options.messageMaxBytes;
    }

    if (this._options.compressionCodec !== undefined) {
      this._topicConfig['compression.codec'] = this._options.compressionCodec;
    }

    if (this._options.compressionLevel !== undefined) {
      this._topicConfig['compression.level'] = this._options.compressionLevel;
    }

    if (this._options.queueBufferingMaxMs !== undefined) {
      this._globalConfig['queue.buffering.max.ms'] =
        this._options.queueBufferingMaxMs;
    }

    // authentication options
    if (this._options.authentication != undefined) {
      this._globalConfig['security.protocol'] =
        this._options.authentication.protocol;
      this._globalConfig['sasl.mechanism'] =
        this._options.authentication.mechanism;
      this._globalConfig['sasl.username'] =
        this._options.authentication.username;
      this._globalConfig['sasl.password'] =
        this._options.authentication.password;
    }

    this._globalConfig.dr_cb = true;
  }

  private _onReady(info: RDKafka.ReadyInfo, metadata: RDKafka.Metadata): void {
    logger.info(
      `RafikiRawKafkaProducer - event.ready - info: ${JSON.stringify(
        info,
        null,
        2
      )}`
    );
  }

  /* istanbul ignore next */
  private _onError(error: RDKafka.LibrdKafkaError): void {
    logger.error(
      `RafikiRawKafkaProducer - event.error - ${JSON.stringify(error, null, 2)}`
    );
  }

  /* istanbul ignore next */
  private _onThrottle(eventData: any) {
    logger.warn(
      `RafikiRawKafkaProducer - event.throttle - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
  }

  /* istanbul ignore next */
  private _onLog(eventData: any): void {
    logger.debug(
      `RafikiRawKafkaProducer - event.log - ${JSON.stringify(
        eventData,
        null,
        2
      )}`
    );
  }

  /* istanbul ignore next */
  private _onStats(eventData: any): void {
    logger.debug(`RafikiRawKafkaProducer - event.stats - ${eventData.message}`);
  }

  private _onDisconnect(metrics: RDKafka.ClientMetrics): void {
    /* istanbul ignore else */
    if (metrics?.connectionOpened) {
      logger.info(
        `RafikiRawKafkaProducer - event.disconnected - connected for ${
          (Date.now() - metrics.connectionOpened) / 1000
        } secs`
      );
    } else {
      logger.info(
        `RafikiRawKafkaProducer - event.disconnected - ${JSON.stringify(
          metrics,
          null,
          2
        )}`
      );
    }
  }

  private _onDeliveryReport(
    err: RDKafka.LibrdKafkaError,
    eventData: RDKafka.DeliveryReport
  ): void {
    /* istanbul ignore if */
    if (err) {
      logger.error(err, 'RafikiRawKafkaProducer - delivery-report error');
      return;
    }
    //this._logger?.isDebugEnabled() && this._logger.debug(`RafikiRawKafkaProducer - delivery-report - ${JSON.stringify(eventData, null, 2)}`)
    if (this._deliveryReportHandlerFn) {
      this._deliveryReportHandlerFn(
        eventData.topic,
        eventData.partition,
        eventData.offset
      );
    }
  }

  private _toRDKafkaProduceParams(msg: IRawMessage): {
    topic: string;
    partition: NumberNullUndefined;
    message: Buffer;
    key: Buffer;
    timestamp: NumberNullUndefined;
    headers: IRawMessageHeader[];
  } {
    const topic: string = msg.topic;
    const partition = msg.partition; // ?? -1 // use default from rdkafka
    const timestamp = msg.timestamp;

    let message: Buffer = Buffer.alloc(0); // default
    if (typeof msg.value === 'string') {
      message = Buffer.from(msg.value, 'utf-8');
    } else if (typeof msg.value === 'object') {
      try {
        message = Buffer.from(JSON.stringify(msg.value), 'utf-8');
      } catch (err) {
        /* istanbul ignore next */
        logger.error(
          err,
          'RafikiRawKafkaProducer - error parsing message value - JSON.stringify() error'
        );
      }
    }

    let key: Buffer = Buffer.alloc(0); // default
    if (typeof msg.key === 'string') {
      key = Buffer.from(msg.key, 'utf-8');
    } else if (typeof msg.key === 'object') {
      try {
        key = Buffer.from(JSON.stringify(msg.key), 'utf-8');
      } catch (err) {
        /* istanbul ignore next */
        logger.error(
          'RafikiRawKafkaProducer - error parsing key value - JSON.stringify() error',
          err
        );
      }
    }

    const headers: IRawMessageHeader[] = [];
    msg.headers?.forEach((header) => {
      // NOTE: kafka headers are key/value pairs, only one pair will ever exist per header rec
      for (const key in header) {
        if (!Object.prototype.hasOwnProperty.call(header, key)) continue;
        headers.push({ [key]: header[key] });
      }
    });

    return {
      topic,
      partition,
      message,
      key,
      timestamp,
      headers
    };
  }

  async send(message: IRawMessage | IRawMessage[] | any): Promise<void> {
    if (!message || (message instanceof Array && message.length <= 0))
      return Promise.resolve();

    return new Promise((resolve, reject) => {
      const messages: IRawMessage[] = Array.isArray(message)
        ? message
        : ([message] as IRawMessage[]);

      let rejected = false;
      let acksRemaining: number = messages.length;

      messages.forEach((msg: IRawMessage) => {
        try {
          const produceParams = this._toRDKafkaProduceParams(msg);
          this._client.produce(
            produceParams.topic,
            produceParams.partition,
            produceParams.message,
            produceParams.key || undefined,
            produceParams.timestamp || undefined,
            produceParams.headers,
            (err: any, offset?: RDKafka.NumberNullUndefined) => {
              /* istanbul ignore if */
              if (err !== null) {
                logger.error(
                  'RafikiRawKafkaProducer - send - Error getting aks from publisher',
                  err
                );
                if (!rejected) {
                  rejected = true;
                  reject(err);
                }
              } else {
                //this.emit("deliveryReport", produceParams.topic, produceParams.partition || null, offset || null)

                acksRemaining--;
                if (acksRemaining <= 0) {
                  resolve();
                }
              }
            }
          );
        } catch (err) {
          /* istanbul ignore next */
          logger.error('RafikiRawKafkaProducer - send ...error !', err);
          /* istanbul ignore next */
          reject(err);
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('RafikiRawKafkaProducer - disconnect called...');
      if (!this._client.isConnected()) {
        logger.warn(
          'RafikiRawKafkaProducer - disconnect called but producer is not connected'
        );
        return resolve();
      }
      this._client.disconnect((err: any, _data: RDKafka.ClientMetrics) => {
        /* istanbul ignore if */
        if (err) {
          logger.error('RafikiRawKafkaProducer - disconnect failed', err);
          return reject(err);
        }
        logger.info('RafikiRawKafkaProducer - disconnected.');
        resolve();
      });
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._client.connect(
        undefined,
        (err: RDKafka.LibrdKafkaError, metadata: RDKafka.Metadata) => {
          /* istanbul ignore if */
          if (err) {
            logger.error(
              err,
              'RafikiRawKafkaProducer - error connecting to cluster'
            );
            return reject(
              new Error(
                `RafikiRawKafkaProducer - error connecting to cluster: ${err.message}`
              )
            );
          }

          //this._logger?.isDebugEnabled() && this._logger.debug(`RafikiRawKafkaProducer::event.ready - metadata: ${JSON.stringify(metadata, null, 2)}`)
          logger.info('RafikiRawKafkaProducer - connected!');
          resolve();
        }
      );
    });
  }

  setDeliveryReportFn(
    handlerCallback:
      | null
      | ((topic: string, partition: number, offset: number) => void)
  ): void {
    this._deliveryReportHandlerFn = handlerCallback;
  }

  async destroy(): Promise<void> {
    logger.info('RafikiRawKafkaProducer - destroy called...');
    return await this.disconnect();
  }
}

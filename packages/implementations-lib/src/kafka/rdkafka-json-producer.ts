import { MessageProducer, Message } from 'common-types-lib';
import {
  RafikiKafkaRawProducer,
  RafikiKafkaRawProducerOptions
} from './raw/rdkafka_raw_producer';
import { RawMessage } from './raw/raw-types';

import { logger } from '../logger';

export type RafikiKafkaJsonProducerOptions = RafikiKafkaRawProducerOptions;

export class RafikiKafkaJsonProducer implements MessageProducer {
  private readonly _rawKafkaProducer: RafikiKafkaRawProducer;

  constructor(options: RafikiKafkaJsonProducerOptions) {
    this._rawKafkaProducer = new RafikiKafkaRawProducer(options);
    logger.info('RafikiKafkaJsonProducer - instance created');
  }

  private _convert(message: Message | Message[]): RawMessage[] {
    const outpuMsgs: RawMessage[] = [];

    const inputMsgs: Message[] = Array.isArray(message)
      ? [...message]
      : [message];

    for (const msg of inputMsgs) {
      outpuMsgs.push({
        topic: msg.msgTopic,
        key: msg.msgKey,
        timestamp: msg.msgTimestamp,
        headers: [],
        value: msg,
        offset: null,
        partition: msg.msgPartition || null
      });

      // TODO: parse headers
    }

    return outpuMsgs;
  }

  async send(message: Message | Message[]): Promise<void> {
    // TODO fill in missing fields with defaults (id, timestamp, etc)

    const rawMsg: RawMessage[] = this._convert(message);
    return this._rawKafkaProducer.send(rawMsg);
  }

  async disconnect(): Promise<void> {
    return this._rawKafkaProducer.disconnect();
  }

  async connect(): Promise<void> {
    return this._rawKafkaProducer.connect();
  }

  setDeliveryReportFn(
    handlerCallback:
      | null
      | ((topic: string, partition: number, offset: number) => void)
  ): void {
    this._rawKafkaProducer.setDeliveryReportFn(handlerCallback);
  }

  async destroy(): Promise<void> {
    return this._rawKafkaProducer.destroy();
  }
}

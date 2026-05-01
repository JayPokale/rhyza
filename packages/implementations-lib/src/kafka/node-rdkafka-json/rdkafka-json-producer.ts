import { IMessageProducer, IMessage, IRawMessage, IMessageProducerAcks, ILogger } from 'common-types-lib';

import { PinoLogger } from '../../logger';
import { RafikiKafkaRawProducer, RafikiKafkaRawProducerOptions } from '../node-rdkafka-raw/rdkafka-raw-producer';

export type RafikiKafkaJsonProducerOptions = RafikiKafkaRawProducerOptions;

export class RafikiKafkaJsonProducer implements IMessageProducer {
  private readonly _logger: ILogger | null;
  private readonly _rawKafkaProducer: RafikiKafkaRawProducer;

  constructor(options: RafikiKafkaJsonProducerOptions, logger: ILogger | null = null) {
    this._logger = logger;
    this._rawKafkaProducer = new RafikiKafkaRawProducer(options, logger);
    this._logger?.info('RafikiKafkaJsonProducer - instance created');
  }

  private _convert(message: IMessage | IMessage[]): IRawMessage[] {
    const outpuMsgs: IRawMessage[] = [];

    const inputMsgs: IMessage[] = Array.isArray(message)
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

  async sendWithoutAcks(message: IMessage | IMessage[]): Promise<void> {
    // TODO fill in missing fields with defaults (id, timestamp, etc)

    const rawMsg: IRawMessage[] = this._convert(message);
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

  send(
    message: IMessage | IMessage[]
  ): Promise<IMessageProducerAcks[]> {
    throw new Error('Method not implemented.');
  }

  async destroy(): Promise<void> {
    return this._rawKafkaProducer.destroy();
  }
}

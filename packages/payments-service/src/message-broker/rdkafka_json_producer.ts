import { IMessageProducer, IMessage } from "./message";
import {
  RafikiKafkaRawProducer,
  RafikiKafkaRawProducerOptions,
} from "./raw/rdkafka_raw_producer";
import { IRawMessage } from "./raw/raw_types";

import logger from "../logger";

export type RafikiKafkaJsonProducerOptions = RafikiKafkaRawProducerOptions;

export class RafikiKafkaJsonProducer implements IMessageProducer {
  private readonly _rawKafkaProducer: RafikiKafkaRawProducer;

  constructor(options: RafikiKafkaJsonProducerOptions) {
    this._rawKafkaProducer = new RafikiKafkaRawProducer(options);
    logger.info("RafikiKafkaJsonProducer - instance created");
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
        partition: msg.msgPartition || null,
      });

      // TODO: parse headers
    }

    return outpuMsgs;
  }

  async send(message: IMessage | IMessage[]): Promise<void> {
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

  async destroy(): Promise<void> {
    return this._rawKafkaProducer.destroy();
  }
}

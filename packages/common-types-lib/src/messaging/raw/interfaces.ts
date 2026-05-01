import { IRawMessage } from './messages';
import { IMessageProducerAcks } from '../interfaces';

export declare interface IRawMessageProducer {
  destroy(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: IRawMessage | IRawMessage[]): Promise<void>;
  sendWithAck(
    message: IRawMessage | IRawMessage[]
  ): Promise<IMessageProducerAcks[]>;
}

export interface IRawMessageConsumer {
  setCallbackFn(handlerCallback: (message: IRawMessage) => Promise<void>): void;
  setBatchCallbackFn(
    batchHandlerCallback: (messages: IRawMessage[]) => Promise<void>
  ): void;
  setTopics(topics: string[]): void;

  setBatchSize(size: number): void;

  destroy(force: boolean): Promise<void>;

  connect(): Promise<void>;
  disconnect(force: boolean): Promise<void>;
  start(): Promise<void>;
  startAndWaitForRebalance(): Promise<void>;
  stop(): Promise<void>;
}

export declare interface IRawMessageProducer {
  destroy(): Promise<void>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send(message: IRawMessage | IRawMessage[] | any): Promise<void>;
}

export declare interface IRawMessageFetcher {
  fetchLast(
    msgKey: string,
    topic: string,
    partitionAndOffset?: { partition: number; offset: number }
  ): Promise<IRawMessage | null>;
  fetchAll(
    msgKey: string,
    topic: string,
    partitionAndOffset?: { partition: number; offset: number }
  ): Promise<IRawMessage[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RawMessageHeader {
  [key: string]: string | Buffer;
}

export interface RawMessage {
  value: Buffer | string | object | null;
  topic: string;
  key: Buffer | string | null;
  timestamp: number | null;
  headers: RawMessageHeader[] | null;
  partition: number | null;
  offset: number | null;
}

export interface IRawMessageConsumer {
  setCallbackFn: (
    handlerCallback: (message: RawMessage) => Promise<void>
  ) => void;
  setBatchCallbackFn: (
    batchHandlerCallback: (messages: RawMessage[]) => Promise<void>
  ) => void;
  setTopics: (topics: string[]) => void;
  setBatchSize(size: number): void;
  destroy: (force: boolean) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: (force: boolean) => Promise<void>;
  start: () => Promise<void>;
  startAndWaitForRebalance: () => Promise<void>;
  stop: () => Promise<void>;
}

export declare interface RawMessageProducer {
  destroy: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (message: RawMessage | RawMessage[] | any) => Promise<void>;
}

export declare interface RawAuthenticationOptions {
  protocol: 'plaintext' | 'ssl' | 'sasl_plaintext' | 'sasl_ssl';
  mechanism: 'PLAIN' | 'GSSAPI' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
  username: string;
  password: string;
}

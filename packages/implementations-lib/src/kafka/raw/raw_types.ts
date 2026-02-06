'use strict'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface IRawMessageHeader {
  [key: string]: string | Buffer
}

export interface IRawMessage {
  value: Buffer | string | object | null
  topic: string
  key: Buffer | string | null
  timestamp: number | null
  headers: IRawMessageHeader[] | null

  partition: number | null
  offset: number | null
}

export interface IRawMessageConsumer {
  setCallbackFn: (
    handlerCallback: (message: IRawMessage) => Promise<void>
  ) => void
  setBatchCallbackFn: (
    batchHandlerCallback: (messages: IRawMessage[]) => Promise<void>
  ) => void
  setTopics: (topics: string[]) => void

  setBatchSize(size: number): void

  destroy: (force: boolean) => Promise<void>

  connect: () => Promise<void>
  disconnect: (force: boolean) => Promise<void>
  start: () => Promise<void>
  startAndWaitForRebalance: () => Promise<void>
  stop: () => Promise<void>
}

export declare interface IRawMessageProducer {
  destroy: () => Promise<void>

  connect: () => Promise<void>
  disconnect: () => Promise<void>

  send: (message: IRawMessage | IRawMessage[] | any) => Promise<void>
}

export declare interface IRawAuthenticationOptions {
  protocol: 'plaintext' | 'ssl' | 'sasl_plaintext' | 'sasl_ssl'
  mechanism: 'PLAIN' | 'GSSAPI' | 'SCRAM-SHA-256' | 'SCRAM-SHA-512'
  username: string
  password: string
}

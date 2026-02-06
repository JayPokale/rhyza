'use strict';

import { IMessage } from './messages';

export interface IMessageConsumer {
  setCallbackFn: (
    handlerCallback: (message: IMessage) => Promise<void>
  ) => void;
  setBatchCallbackFn: (
    batchHandlerCallback: (messages: IMessage[]) => Promise<void>
  ) => void;
  setFilteringFn: (filterFn: (message: IMessage) => boolean) => void;
  setTopics: (topics: string[]) => void;

  setBatchSize(size: number): void;

  destroy: (force: boolean) => Promise<void>;

  connect: () => Promise<void>;
  disconnect: (force: boolean) => Promise<void>;
  start: () => Promise<void>;
  startAndWaitForRebalance: () => Promise<void>;
  stop: () => Promise<void>;
}

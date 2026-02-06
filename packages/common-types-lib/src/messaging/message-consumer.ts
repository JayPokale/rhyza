'use strict';

import { Message } from './messages';

export interface MessageConsumer {
  setCallbackFn: (handlerCallback: (message: Message) => Promise<void>) => void;
  setBatchCallbackFn: (
    batchHandlerCallback: (messages: Message[]) => Promise<void>
  ) => void;
  setFilteringFn: (filterFn: (message: Message) => boolean) => void;
  setTopics: (topics: string[]) => void;
  setBatchSize(size: number): void;
  destroy: (force: boolean) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: (force: boolean) => Promise<void>;
  start: () => Promise<void>;
  startAndWaitForRebalance: () => Promise<void>;
  stop: () => Promise<void>;
}

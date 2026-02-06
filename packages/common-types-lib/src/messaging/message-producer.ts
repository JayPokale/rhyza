import { Message } from './messages';

export declare interface MessageProducer {
  destroy: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (message: Message | Message[]) => Promise<void>;
}

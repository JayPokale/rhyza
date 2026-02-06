'use strict'

import { IMessage } from './messages'

export declare interface IMessageProducer {
  destroy: () => Promise<void>

  connect: () => Promise<void>
  disconnect: () => Promise<void>

  send: (message: IMessage | IMessage[]) => Promise<void>
}

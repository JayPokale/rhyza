"use strict"

import { IMessage, IMessageConsumer } from "../message"

import {CreateIncomingPaymentRequest, CreateQuoteRequest, PaymentService} from "../../payment"

import {
  CreateIncomingPaymentCmd, CreateQuoteCmd, Topic
} from "../command"

import logger from "../../logger";

export class RafikiCommandHandler {
  private _messageConsumer: IMessageConsumer
  private _paymentService: PaymentService

  constructor(
    messageConsumer: IMessageConsumer,
    paymentService: PaymentService
  ) {
    this._messageConsumer = messageConsumer
    this._paymentService = paymentService
  }

  async start():Promise<void>{
    this._messageConsumer.setTopics([Topic.Commands])
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this))
    await this._messageConsumer.connect()
    await this._messageConsumer.startAndWaitForRebalance()
  }

  private async _msgHandler(message: IMessage): Promise<void>{
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug(`Got message in RafikiCommandHandler with name: ${message.msgName}`)
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            await this._paymentService.createIncomingPayment(message.payload as CreateIncomingPaymentRequest)
            break
          case CreateQuoteCmd.name:
            await this._paymentService.createQuote(message.payload as CreateQuoteRequest)
            break
          default: {
            logger.warn(`RafikiCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`)
          }
        }

      } catch (err) {
        logger.error(`RafikiCommandHandler - processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`, err)
      } finally {
        resolve()
      }
    })
  }

  async stop():Promise<void>{
    await this._messageConsumer.stop()
  }
}

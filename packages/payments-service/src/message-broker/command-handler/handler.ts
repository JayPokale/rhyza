"use strict"

import {IMessage, IMessageConsumer, IMessageProducer} from "../message"

import {
  CreateIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  PaymentService
} from "../../payment"

import {
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentFromQuoteCmd,
  CreateQuoteCmd,
  Topic
} from "../command"

import {
  ApiRspErrorEvent,
  ApiRspIncomingPaymentEvent, ApiRspOutgoingPaymentEvent, ApiRspQuoteEvent

} from "../event"

import logger from "../../logger";
import os from "os";

export class RafikiCommandHandler {
  private _messageConsumer: IMessageConsumer
  private _messageProducer: IMessageProducer
  private _paymentService: PaymentService

  constructor(
    messageConsumer: IMessageConsumer,
    messageProducer: IMessageProducer,
    paymentService: PaymentService
  ) {
    this._messageConsumer = messageConsumer
    this._messageProducer = messageProducer
    this._paymentService = paymentService
  }

  async start(): Promise<void> {
    this._messageConsumer.setTopics([
      Topic.Commands, Topic.IncomingPayments, Topic.Quotes, Topic.OutgoingPaymentsFromQuote
    ])
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this))
    await this._messageConsumer.connect()
    await this._messageConsumer.startAndWaitForRebalance()
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug(`Got message in RafikiCommandHandler with name: ${message.msgName}:${message.requestId} -> ${message}`)
      logger.debug(`Handler(${os.hostname()}): JASON: Receiving payment to be processed by Rafiki: ${JSON.stringify(message)}`)
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            const inPayId = await this._paymentService.createIncomingPayment(this.toDomainIncoming(message as CreateIncomingPaymentCmd))
            if (message.requestId) {
              const event = new ApiRspIncomingPaymentEvent({
                createdId: inPayId,
              }, message.requestId)
              await this._messageProducer.send(event)
              logger.debug(`Handler(${os.hostname()}): JASON: Sending: ${JSON.stringify(event)}`)
            }
            break
          case CreateQuoteCmd.name:
            const quoteId = await this._paymentService.createQuote(this.toDomainQuote(message as CreateQuoteCmd))
            if (message.requestId) {
              await this._messageProducer.send(new ApiRspQuoteEvent({
                createdId: quoteId,
              }, message.requestId))
            }
            break
          case CreateOutgoingPaymentFromQuoteCmd.name:
            const outPayId = await this._paymentService.createOutgoingPaymentFromQuote(this.toDomainOutgoingFromQuote(
              message as CreateOutgoingPaymentFromQuoteCmd
            ))
            if (message.requestId) {
              await this._messageProducer.send(new ApiRspOutgoingPaymentEvent({
                createdId: outPayId,
              }, message.requestId))
            }
            break
          default: {
            logger.warn(`RafikiCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`)
          }
        }
      } catch (err) {
        logger.error(`RafikiCommandHandler - error processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`, err)
        logger.error(err)
        logger.error("Payload for error:")
        logger.error(message)
        if (err instanceof Error) {
          if (message.requestId) {
            await this._messageProducer.send(new ApiRspErrorEvent({
              requestId: message.requestId,
              isCmdErrorResponse: true,
              errorType: err.constructor.name,
              error: err.message,
              stack: err.stack,
              message: err.message,
              name: err.name
            },
            message.requestId
          ))
          }
        }
        logger.error(err)
      } finally {
        logger.debug(`Handler(${os.hostname()}): JASON: Complete.`)
        resolve()
      }
    })
  }

  async stop(): Promise<void> {
    await this._messageConsumer.stop()
  }

  private toDomainIncoming(cmd: CreateIncomingPaymentCmd): CreateIncomingPaymentRequest {
    return {
      id: cmd.payload.id,
      expiresAt: cmd.payload.expiresAt,
      incomingAmount: cmd.payload.incomingAmount ? {
          assetCode: cmd.payload.incomingAmount.assetCode,
          assetScale: cmd.payload.incomingAmount.assetScale,
          value: BigInt(cmd.payload.incomingAmount.value),
        }
        : undefined,
      walletAddressId: cmd.payload.walletAddressId,
    }
  }

  private toDomainQuote(cmd: CreateQuoteCmd): CreateQuoteRequest {
    return {
      id: cmd.payload.id,
      debitAmount: cmd.payload.debitAmount
        ? {
          assetCode: cmd.payload.debitAmount.assetCode,
          assetScale: cmd.payload.debitAmount.assetScale,
          value: BigInt(cmd.payload.debitAmount.value),
        }
        : undefined,
      receiveAmount: cmd.payload.receiveAmount
        ? {
          assetCode: cmd.payload.receiveAmount.assetCode,
          assetScale: cmd.payload.receiveAmount.assetScale,
          value: BigInt(cmd.payload.receiveAmount.value),
        }
        : undefined,
      senderWalletAddressId: cmd.payload.senderWalletAddressId,
      incomingPaymentId: cmd.payload.incomingPaymentId,
    }
  }

  public toDomainOutgoingFromQuote(cmd: CreateOutgoingPaymentFromQuoteCmd): CreateOutgoingPaymentFromQuoteRequest {
    return {
      id: cmd.payload.id,
      senderWalletAddressId: cmd.payload.senderWalletAddressId,
      quoteId: cmd.payload.quoteId,
    }
  }
}

"use strict"

import {IMessage, IMessageConsumer, IMessageProducer} from "../message"

import {
  CreateIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  PaymentService
} from "../../payment"

import {
  ApiResponseCmd, ApiResponseCmdPayload,
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentFromQuoteCmd,
  CreateQuoteCmd,
  Topic
} from "../command"

import logger from "../../logger";

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
      logger.info(`Got message in RafikiCommandHandler with name: ${message.msgName} -> ${message.requestId} -> ${message}`)
      logger.debug(`Got message in RafikiCommandHandler with name: ${message.msgName}`)
      let response: any = {}
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            response = await this._paymentService.createIncomingPayment(this.toDomainIncoming(message as CreateIncomingPaymentCmd))
            break
          case CreateQuoteCmd.name:
            response = await this._paymentService.createQuote(this.toDomainQuote(message as CreateQuoteCmd))
            break
          case CreateOutgoingPaymentFromQuoteCmd.name:
            response = await this._paymentService.createOutgoingPaymentFromQuote(this.toDomainOutgoingFromQuote(
              message as CreateOutgoingPaymentFromQuoteCmd
            ))
            break
          default: {
            logger.warn(`RafikiCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`)
          }
        }
      } catch (err: Error | any) {
        logger.error(`RafikiCommandHandler - processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`, err)
        logger.error(err)
        logger.error("Payload for error:")
        logger.error(message)
        response = {
          isCmdErrorResponse: true,
          error: err.message,
          stack: err.stack,
          message: err.message,
          name: err.name,
          code: err.code,
          status: err.status,
          statusCode: err.statusCode,
          statusMessage: err.statusMessage,
          details: err.details,
        }
      } finally {
        if (message.requestId && response) {
          const payload = {
            requestId: message.requestId,
            response
          }
          logger.info(`\n\n\nSending Message for Request error: ${message.msgName} -> ${message.requestId} -> ${message}\n\n`)
          await this._messageProducer.send(new ApiResponseCmd(payload))
        }

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

export class RafikiApiResponseCommandHandler {
  private _messageConsumer: IMessageConsumer
  private _rspMap: Map<string, Object | Error>

  constructor(
    messageConsumer: IMessageConsumer,
    rspMap: Map<string, Object | Error>
  ) {
    this._messageConsumer = messageConsumer
    this._rspMap = rspMap
  }

  async start(): Promise<void> {
    this._messageConsumer.setTopics([Topic.ApiRequest])
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this))
    await this._messageConsumer.connect()
    await this._messageConsumer.startAndWaitForRebalance()
  }

  async stop():Promise<void>{
    await this._messageConsumer.stop()
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug(`Got message in RafikiApiResponseCommandHandler with name: ${message.msgName}`)
      try {
        switch (message.msgName) {
          case ApiResponseCmd.name:
            const payload = message.payload as ApiResponseCmdPayload
            this._rspMap.set(payload.requestId, payload.response)
            break
          default: {
            logger.warn(`RafikiApiResponseCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`)
          }
        }
      } catch (err) {
        logger.error(`RafikiApiResponseCommandHandler - processing command - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`, err)
        logger.error(err)
        logger.error("Payload for error:")
        logger.error(message)
      } finally {
        resolve()
      }
    })
  }
}

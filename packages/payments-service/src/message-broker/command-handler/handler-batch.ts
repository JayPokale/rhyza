"use strict";

import { IMessage, IMessageConsumer, IMessageProducer } from "../message";

import {
  CreateIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  PaymentService,
} from "../../payment";

import {
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentFromQuoteCmd,
  CreateQuoteCmd,
  Topic,
} from "../command";

import logger from "../../logger";
import { ApiRspErrorEvent } from "../event";

export class RafikiCommandHandler {
  private _messageConsumer: IMessageConsumer;
  private _messageProducer: IMessageProducer;
  private _paymentService: PaymentService;

  // --- New fields for caching logic ---
  private messageCache: IMessage[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly MAX_CACHE_DURATION_MS = 500;

  constructor(
    messageConsumer: IMessageConsumer,
    messageProducer: IMessageProducer,
    paymentService: PaymentService
  ) {
    this._messageConsumer = messageConsumer;
    this._messageProducer = messageProducer;
    this._paymentService = paymentService;
  }

  async start(): Promise<void> {
    this._messageConsumer.setTopics([
      Topic.IncomingPayments,
      Topic.Quotes,
      Topic.OutgoingPaymentsFromQuote,
    ]);
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
    await this._messageConsumer.connect();
    await this._messageConsumer.startAndWaitForRebalance();

    // Instead of processing each message immediately,
    // we will push it into a local cache and process later
    this._messageConsumer.setCallbackFn(this._cacheMessageHandler.bind(this));
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug({ message }, `Got message in RafikiCommandHandler`);
      let response: any = {};
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            response = await this._paymentService.createIncomingPayment(
              this.toDomainIncoming(message as CreateIncomingPaymentCmd)
            );
            this.messageCache.push(message);
            break;
          case CreateQuoteCmd.name:
            response = await this._paymentService.createQuote(
              this.toDomainQuote(message as CreateQuoteCmd)
            );
            break;
          case CreateOutgoingPaymentFromQuoteCmd.name:
            response =
              await this._paymentService.createOutgoingPaymentFromQuote(
                this.toDomainOutgoingFromQuote(
                  message as CreateOutgoingPaymentFromQuoteCmd
                )
              );
            break;
          default: {
            logger.warn(
              `RafikiCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`
            );
          }
        }
      } catch (err) {
        logger.error(
          `RafikiCommandHandler - error processing command - ${
            message?.msgName
          }:${message?.msgKey}:${message?.msgId} - Error: ${(
            err as Error
          )?.message?.toString()}`,
          err
        );
        logger.error(err);
        logger.error("CommandHandlerBatch -> Payload for error:");
        logger.error(message);
        if (err instanceof Error) {
          if (message.requestId) {
            await this._messageProducer.send(
              new ApiRspErrorEvent(
                {
                  requestId: message.requestId,
                  isCmdErrorResponse: true,
                  errorType: err.constructor.name,
                  error: err.message,
                  stack: err.stack,
                  message: err.message,
                  name: err.name,
                },
                message.requestId
              )
            );
          }
        }
        logger.error(err);
      } finally {
        resolve();
      }
    });
  }

  /**
   * Receives incoming messages and caches them.
   * If the cache reaches MAX_CACHE_SIZE or if the first message has sat unflushed
   * for more than MAX_CACHE_DURATION_MS, we flush (process them).
   */
  private async _cacheMessageHandler(message: IMessage): Promise<void> {
    // Add to the local cache
    this.messageCache.push(message);

    // If we exceed the max size, flush immediately
    if (this.messageCache.length >= this.MAX_CACHE_SIZE) {
      await this._flushMessageCache();
      return;
    }

    // If no timer is scheduled, schedule one to flush after MAX_CACHE_DURATION_MS
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(async () => {
        await this._flushMessageCache();
      }, this.MAX_CACHE_DURATION_MS);
    }
  }

  /**
   * Flush the local cache: process all messages, then clear the cache and timer.
   */
  private async _flushMessageCache(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const messagesToProcess = [...this.messageCache];
    this.messageCache = [];

    //TODO Store all of the messages....
    for (const msg of messagesToProcess) {
      // Process each message individually
    }
  }

  async stop(): Promise<void> {
    await this._messageConsumer.stop();
  }

  private toDomainIncoming(
    cmd: CreateIncomingPaymentCmd
  ): CreateIncomingPaymentRequest {
    return {
      id: cmd.payload.id,
      expiresAt: cmd.payload.expiresAt,
      incomingAmount: cmd.payload.incomingAmount
        ? {
            assetCode: cmd.payload.incomingAmount.assetCode,
            assetScale: cmd.payload.incomingAmount.assetScale,
            value: BigInt(cmd.payload.incomingAmount.value),
          }
        : undefined,
      walletAddressId: cmd.payload.walletAddressId,
    };
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
    };
  }

  public toDomainOutgoingFromQuote(
    cmd: CreateOutgoingPaymentFromQuoteCmd
  ): CreateOutgoingPaymentFromQuoteRequest {
    return {
      id: cmd.payload.id,
      senderWalletAddressId: cmd.payload.senderWalletAddressId,
      quoteId: cmd.payload.quoteId,
    };
  }
}

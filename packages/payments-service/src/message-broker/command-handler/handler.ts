import { IMessage, IMessageConsumer, IMessageProducer } from "../message";

import {
  CreateIncomingPaymentRequest,
  CreateOutgoingPaymentFromIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  PaymentService,
} from "../../payment";

import {
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentCmd,
  CreateQuoteCmd,
  Topic,
} from "../command";

import {
  ApiRspErrorEvent,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent,
} from "../event";

import logger from "../../logger";
import type { ITelemetryService } from "../../../../telemetry";

export class RafikiCommandHandler {
  private _messageConsumer: IMessageConsumer;
  private _messageProducer: IMessageProducer;
  private _paymentService: PaymentService;

  constructor(
    messageConsumer: IMessageConsumer,
    messageProducer: IMessageProducer,
    paymentService: PaymentService,
    private _telemetryService: ITelemetryService
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
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug({ message }, `CommandHandler: Received command`);

      const stopTimerMsgHandler = this._telemetryService.startTimer(
        'command_handler_msg_handler_ms',
        {
          callName: 'Handler:handleMessage',
          description: 'Time to process a message.'
        }
      )
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            const inPayId = await this._paymentService.createIncomingPayment(
              this.toDomainIncoming(message as CreateIncomingPaymentCmd)
            );
            if (message.requestId) {
              const event = new ApiRspIncomingPaymentEvent(
                {
                  createdId: inPayId,
                },
                message.requestId
              );
              await this._messageProducer.send(event);
              logger.debug({ event }, `CommandHandler: Sending response`);
            }
            break;
          case CreateQuoteCmd.name:
            const quoteId = await this._paymentService.createQuote(
              this.toDomainQuote(message as CreateQuoteCmd)
            );
            if (message.requestId) {
              await this._messageProducer.send(
                new ApiRspQuoteEvent(
                  {
                    createdId: quoteId,
                  },
                  message.requestId
                )
              );
            }
            break;
          case CreateOutgoingPaymentCmd.name:
            const outPayId = await this._paymentService.createOutgoingPayment(
              this.toDomainOutgoing(message as CreateOutgoingPaymentCmd)
            );
            if (message.requestId) {
              await this._messageProducer.send(
                new ApiRspOutgoingPaymentEvent(
                  {
                    createdId: outPayId,
                  },
                  message.requestId
                )
              );
            }
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
        logger.error("CommandHandler -> Payload for error:");
        logger.error(message);
        if (err instanceof Error) {
          if (message.requestId) {
            const errEvent = new ApiRspErrorEvent(
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
            );
            logger.error(
              `CommandHandler -> Sending error event: ${JSON.stringify(
                errEvent
              )}`
            );
            await this._messageProducer.send(errEvent);
          }
        }
        logger.error(err);
      } finally {
        stopTimerMsgHandler()
        this._telemetryService.incrementCounter("message_handler_commands_processed", 1);

        logger.debug(`CommandHandler: Done`);
        resolve();
      }
    });
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

  // TODO: return type of this is probably not quite right...
  // Union (|) vs Intersection (&) type
  // If the service is a union, should all the types alongt he way (return type here,
  // command payload type, etc) be union as well?
  // Should I change the service to not be a union, but an intersection?
  // I guess the value in the union is it uses the explicit types the udnerlying createFrom
  // functions use but we no longer really care about that from the outside.
  // Maybe createOutgoingPayment type should be an intersection then manually form the explicit
  // createFrom arg types?
  public toDomainOutgoing(
    cmd: CreateOutgoingPaymentCmd
  ): CreateOutgoingPaymentFromQuoteRequest &
    CreateOutgoingPaymentFromIncomingPaymentRequest {
    const request = {
      senderWalletAddressId: cmd.payload.senderWalletAddressId,
    } as CreateOutgoingPaymentFromQuoteRequest &
      CreateOutgoingPaymentFromIncomingPaymentRequest;

    if (cmd.payload.id) {
      request.id = cmd.payload.id;
    }
    if (cmd.payload.incomingPaymentId) {
      request.incomingPaymentId = cmd.payload.incomingPaymentId;
    }
    if (cmd.payload.quoteId) {
      request.quoteId = cmd.payload.quoteId;
    }
    if (cmd.payload.debitAmount) {
      request.debitAmount = {
        ...cmd.payload.debitAmount,
        value: BigInt(cmd.payload.debitAmount.value),
      };
    }
    if (cmd.payload.receiveAmount) {
      request.receiveAmount = {
        ...cmd.payload.receiveAmount,
        value: BigInt(cmd.payload.receiveAmount.value),
      };
    }

    return request;
  }
}

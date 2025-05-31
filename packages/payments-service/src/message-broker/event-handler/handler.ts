import { IMessage, IMessageConsumer, IMessageProducer } from "../message";
import { PaymentService } from "../../payment";
import { OutgoingPaymentCreatedEvent, Topic } from "../event";
import logger from "../../logger";
import type { ITelemetryService } from "telemetry";

export class RafikiEventHandler {
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
      Topic.OutgoingPaymentCreated,
      Topic.OutgoingPaymentFunded,
    ]);
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
    await this._messageConsumer.connect();
    await this._messageConsumer.startAndWaitForRebalance();
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug({ message }, `EventHandler: Received event`);

      const stopTimerMsgHandler = this._telemetryService.startTimer(
        "event_handler_msg_handler_ms",
        {
          callName: "EventHandler:handleMessage",
          description: "Time to process a message.",
        }
      );
      try {
        switch (message.msgName) {
          case OutgoingPaymentCreatedEvent.name:
            console.log("handling OutgoingPaymentCreatedEvent: ", {
              payload: (message as OutgoingPaymentCreatedEvent).payload,
            });
          // case CreateIncomingPaymentCmd.name:
          //   const inPayId = await this._paymentService.createIncomingPayment(
          //     this.toDomainIncoming(message as CreateIncomingPaymentCmd)
          //   );
          //   if (message.requestId) {
          //     const event = new ApiRspIncomingPaymentEvent(
          //       {
          //         createdId: inPayId,
          //       },
          //       message.requestId
          //     );
          //     await this._messageProducer.send(event);
          //     logger.debug({ event }, `CommandHandler: Sending response`);
          //   }
          //   break;
          // case CreateQuoteCmd.name:
          //   const quoteId = await this._paymentService.createQuote(
          //     this.toDomainQuote(message as CreateQuoteCmd)
          //   );
          //   if (message.requestId) {
          //     await this._messageProducer.send(
          //       new ApiRspQuoteEvent(
          //         {
          //           createdId: quoteId,
          //         },
          //         message.requestId
          //       )
          //     );
          //   }
          //   break;
          // case CreateOutgoingPaymentCmd.name:
          //   const outPayId = await this._paymentService.createOutgoingPayment(
          //     this.toDomainOutgoing(message as CreateOutgoingPaymentCmd)
          //   );
          //   if (message.requestId) {
          //     await this._messageProducer.send(
          //       new ApiRspOutgoingPaymentEvent(
          //         {
          //           createdId: outPayId,
          //         },
          //         message.requestId
          //       )
          //     );
          //   }
          //   break;
          default: {
            logger.warn(
              `RafikiEventHandler - unknown event - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`
            );
          }
        }
      } catch (err) {
        // TODO: revisit error handling behavior - what else is needed?
        logger.error(
          `RafikiEventHandler - error processing event - ${
            message?.msgName
          }:${message?.msgKey}:${message?.msgId} - Error: ${(
            err as Error
          )?.message?.toString()}`,
          err
        );
        logger.error(err);
        logger.error("EventHandler -> Payload for error:");
        logger.error(message);
        // if (err instanceof Error) {
        //   if (message.requestId) {
        //     // TODO: Real error. Mirror new ApiRspErrorEvent or is the nature
        //     // of that different because change error type (not api rsp)
        //     const errEvent = new ApiRspErrorEvent(
        //       {
        //         requestId: message.requestId,
        //         isCmdErrorResponse: true,
        //         errorType: err.constructor.name,
        //         error: err.message,
        //         stack: err.stack,
        //         message: err.message,
        //         name: err.name,
        //       },
        //       message.requestId
        //     );
        //     logger.error(
        //       `CommandHandler -> Sending error event: ${JSON.stringify(
        //         errEvent
        //       )}`
        //     );
        //     await this._messageProducer.send(errEvent);
        //   }
        // }
      } finally {
        stopTimerMsgHandler();
        this._telemetryService.incrementCounter(
          "message_handler_events_processed",
          1
        );

        logger.debug(`EventHandler: Done`);
        resolve();
      }
    });
  }

  async stop(): Promise<void> {
    await this._messageConsumer.stop();
  }

  // private toDomainIncoming(
  //   cmd: CreateIncomingPaymentCmd
  // ): CreateIncomingPaymentRequest {
  //   return {
  //     id: cmd.payload.id,
  //     expiresAt: cmd.payload.expiresAt,
  //     incomingAmount: cmd.payload.incomingAmount
  //       ? {
  //           assetCode: cmd.payload.incomingAmount.assetCode,
  //           assetScale: cmd.payload.incomingAmount.assetScale,
  //           value: BigInt(cmd.payload.incomingAmount.value),
  //         }
  //       : undefined,
  //     walletAddressId: cmd.payload.walletAddressId,
  //   };
  // }

  // private toDomainQuote(cmd: CreateQuoteCmd): CreateQuoteRequest {
  //   return {
  //     id: cmd.payload.id,
  //     debitAmount: cmd.payload.debitAmount
  //       ? {
  //           assetCode: cmd.payload.debitAmount.assetCode,
  //           assetScale: cmd.payload.debitAmount.assetScale,
  //           value: BigInt(cmd.payload.debitAmount.value),
  //         }
  //       : undefined,
  //     receiveAmount: cmd.payload.receiveAmount
  //       ? {
  //           assetCode: cmd.payload.receiveAmount.assetCode,
  //           assetScale: cmd.payload.receiveAmount.assetScale,
  //           value: BigInt(cmd.payload.receiveAmount.value),
  //         }
  //       : undefined,
  //     senderWalletAddressId: cmd.payload.senderWalletAddressId,
  //     incomingPaymentId: cmd.payload.incomingPaymentId,
  //   };
  // }

  // public toDomainOutgoing(
  //   cmd: CreateOutgoingPaymentCmd
  // ): CreateOutgoingPaymentFromQuoteRequest &
  //   CreateOutgoingPaymentFromIncomingPaymentRequest {
  //   const request = {
  //     senderWalletAddressId: cmd.payload.senderWalletAddressId,
  //   } as CreateOutgoingPaymentFromQuoteRequest &
  //     CreateOutgoingPaymentFromIncomingPaymentRequest;

  //   if (cmd.payload.id) {
  //     request.id = cmd.payload.id;
  //   }
  //   if (cmd.payload.incomingPaymentId) {
  //     request.incomingPaymentId = cmd.payload.incomingPaymentId;
  //   }
  //   if (cmd.payload.quoteId) {
  //     request.quoteId = cmd.payload.quoteId;
  //   }
  //   if (cmd.payload.debitAmount) {
  //     request.debitAmount = {
  //       ...cmd.payload.debitAmount,
  //       value: BigInt(cmd.payload.debitAmount.value),
  //     };
  //   }

  //   return request;
  // }
}

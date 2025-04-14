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

import {
  ApiRspErrorEvent,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent,
} from "../event";

import logger from "../../logger";
import type { ITelemetryService } from "../../../../telemetry";
import { Consumer, Producer } from "kafkajs";

interface Message {
  payload: Record<string, unknown>;
  msgName: string;
  requestId: string;
  topic: string;
}
export class RafikiCommandHandler {
  private _paymentService: PaymentService;

  constructor(
    private _messageConsumer: Consumer,
    private _messageProducer: Producer,
    paymentService: PaymentService,
    private _telemetryService: ITelemetryService
  ) {
    this._paymentService = paymentService;
  }

  async start(): Promise<void> {
    await this._messageConsumer.connect();
    await this._messageConsumer.subscribe({
      topics: [
        Topic.Quotes,
        Topic.IncomingPayments,
        Topic.OutgoingPaymentsFromQuote,
      ],
    });

    await this._messageConsumer.run({
      eachMessage: async ({ topic, message }) => {
        const msg = JSON.parse(message.value!.toString());
        await this._msgHandler({
          topic,
          requestId: msg.requestId,
          msgName: msg.msgName,
          payload: msg.payload,
        } as unknown as Message);
      },
    });
  }

  private async _msgHandler(message: Message): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug({ message }, `CommandHandler: Received command`);

      const stopTimerMsgHandler = this._telemetryService.startTimer(
        "command_handler_msg_handler_ms",
        {
          callName: "Handler:handleMessage",
          description: "Time to process a message.",
        }
      );
      try {
        switch (message.msgName) {
          case CreateIncomingPaymentCmd.name:
            const inPayId = await this._paymentService.createIncomingPayment(
              this.toDomainIncoming(
                message as unknown as CreateIncomingPaymentCmd
              )
            );
            if (message.requestId) {
              const event = new ApiRspIncomingPaymentEvent(
                {
                  createdId: inPayId,
                },
                message.requestId
              );
              await this._messageProducer.send({
                topic: event.msgTopic,
                messages: [
                  {
                    value: JSON.stringify({
                      payload: event.payload,
                      requestId: event.requestId,
                      msgName: event.msgName,
                    }),
                    key: event.msgKey,
                  },
                ],
              });
              logger.debug({ event }, `CommandHandler: Sending response`);
            }
            break;
          case CreateQuoteCmd.name:
            const quoteId = await this._paymentService.createQuote(
              this.toDomainQuote(message as unknown as CreateQuoteCmd)
            );
            if (message.requestId) {
              const event = new ApiRspQuoteEvent(
                {
                  createdId: quoteId,
                },
                message.requestId
              );

              await this._messageProducer.send({
                topic: event.msgTopic,
                messages: [
                  {
                    value: JSON.stringify({
                      payload: event.payload,
                      requestId: event.requestId,
                      msgName: event.msgName,
                    }),
                    key: event.msgKey,
                  },
                ],
              });
            }
            break;
          case CreateOutgoingPaymentFromQuoteCmd.name:
            const outPayId =
              await this._paymentService.createOutgoingPaymentFromQuote(
                this.toDomainOutgoingFromQuote(
                  message as unknown as CreateOutgoingPaymentFromQuoteCmd
                )
              );
            if (message.requestId) {
              const event = new ApiRspOutgoingPaymentEvent(
                {
                  createdId: outPayId,
                },
                message.requestId
              );
              await this._messageProducer.send({
                topic: event.msgTopic,
                messages: [
                  {
                    value: JSON.stringify({
                      payload: event.payload,
                      requestId: event.requestId,
                      msgName: event.msgName,
                    }),
                    key: event.msgKey,
                  },
                ],
              });
            }
            break;
          default: {
          }
        }
      } catch (err) {
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
            await this._messageProducer.send({
              topic: errEvent.msgTopic,
              messages: [
                {
                  value: JSON.stringify({
                    payload: errEvent.payload,
                    requestId: errEvent.requestId,
                    msgName: errEvent.msgName,
                  }),
                  key: errEvent.msgKey,
                },
              ],
            });
          }
        }
        logger.error(err);
      } finally {
        stopTimerMsgHandler();
        this._telemetryService.incrementCounter(
          "message_handler_commands_processed",
          1
        );

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

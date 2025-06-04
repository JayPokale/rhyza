import { IMessage, IMessageConsumer } from "../message";
import {
  deserializeIncomingPayment,
  deserializeOutgoingPayment,
  LocalOutgoingPaymentCreatedEvent2,
  LocalOutgoingPaymentFundedEvent2,
  PaymentEventType,
  PaymentService,
} from "../../payment";
import {
  LocalOutgoingPaymentCreatedEvent,
  LocalOutgoingPaymentFundedEvent,
  Topic,
} from "../event";
import logger from "../../logger";
import type { ITelemetryService } from "telemetry";
import { deserializeAmount } from "../../shared";

export class RafikiEventHandler {
  private _messageConsumer: IMessageConsumer;
  private _paymentService: PaymentService;

  constructor(
    messageConsumer: IMessageConsumer,
    paymentService: PaymentService,
    private _telemetryService: ITelemetryService
  ) {
    this._messageConsumer = messageConsumer;
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
          case LocalOutgoingPaymentCreatedEvent.name: {
            const msg = message as LocalOutgoingPaymentCreatedEvent;
            const event: LocalOutgoingPaymentCreatedEvent2 = {
              type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_CREATED,
              data: {
                outgoingPayment: deserializeOutgoingPayment(
                  msg.payload.outgoingPayment
                ),
                incomingPayment: deserializeIncomingPayment(
                  msg.payload.incomingPayment
                ),
                senderWalletAddressId: msg.payload.senderWalletAddressId,
                debitAmount: deserializeAmount(msg.payload.debitAmount),
                receiveAmount: deserializeAmount(msg.payload.receiveAmount),
              },
            };
            await this._paymentService.handleLocalOutgoingPaymentCreatedEvent(
              event
            );
            break;
          }
          case LocalOutgoingPaymentFundedEvent.name: {
            const msg = message as LocalOutgoingPaymentFundedEvent;
            const event: LocalOutgoingPaymentFundedEvent2 = {
              type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
              data: {
                outgoingPayment: deserializeOutgoingPayment(
                  msg.payload.outgoingPayment
                ),
                incomingPayment: deserializeIncomingPayment(
                  msg.payload.incomingPayment
                ),
                senderWalletAddressId: msg.payload.senderWalletAddressId,
                debitAmount: deserializeAmount(msg.payload.debitAmount),
                receiveAmount: deserializeAmount(msg.payload.receiveAmount),
              },
            };
            await this._paymentService.handleLocalOutgoingPaymentFundedEvent(
              event
            );
            break;
          }
          default: {
            logger.warn(
              `RafikiEventHandler - unknown event - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`
            );
          }
        }
      } catch (err) {
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
}

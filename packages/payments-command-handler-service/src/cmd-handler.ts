import {
  CommandTopics,
  Message,
  MessageConsumer,
  MessageProducer
} from 'common-types-lib';
import {
  CreatePaymentIntentCmd,
  CreateQuoteCmd,
  CreatePaymentCmd,
  PaymentIntentAggregate,
  ApprovePaymentCmd,
  FinalizeRemoteQuoteCmd,
  FailRemoteQuoteCmd,
  ImportRemotePaymentIntentCmd
} from 'payments-domain-lib';

export class PaymentsCommandHandler {
  private _msgConsumer: MessageConsumer;
  private _msgProducer: MessageProducer;
  private _paymentIntentAggregate: PaymentIntentAggregate;

  constructor(
    msgConsumer: MessageConsumer,
    msgProducer: MessageProducer,
    paymentIntentAggregate: PaymentIntentAggregate
  ) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
    this._paymentIntentAggregate = paymentIntentAggregate;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([CommandTopics.PaymentCommands]);
    this._msgConsumer.setBatchCallbackFn(this._handleBatch.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleBatch(messages: Message[]): Promise<void> {
    const commandMessages: Message[] = [];
    // TODO: route quote and outgoing payment commands to their aggregates
    const unhandled: Message[] = [];

    for (const msg of messages) {
      switch (msg.msgName) {
        case CreatePaymentIntentCmd.name:
          commandMessages.push(msg);
          break;
        case CreateQuoteCmd.name:
          commandMessages.push(msg);
          break;
        case CreatePaymentCmd.name:
          commandMessages.push(msg);
          break;
        case ApprovePaymentCmd.name:
          commandMessages.push(msg);
          break;
        case FinalizeRemoteQuoteCmd.name:
          commandMessages.push(msg);
          break;
        case FailRemoteQuoteCmd.name:
          commandMessages.push(msg);
          break;
        case ImportRemotePaymentIntentCmd.name:
          commandMessages.push(msg);
          break;
        default:
          unhandled.push(msg);
          break;
      }
    }

    if (unhandled.length > 0) {
      console.warn(
        `Unhandled command types: ${[...new Set(unhandled.map((m) => m.msgName))].join(', ')}`
      );
    }

    const eventsToPublish: Message[] = [];

    if (commandMessages.length > 0) {
      const { events } =
        await this._paymentIntentAggregate.handleBatch(commandMessages);
      eventsToPublish.push(...events);

      await this._paymentIntentAggregate.flush();
    }

    if (eventsToPublish.length > 0) {
      await this._msgProducer.send(eventsToPublish);
    }
  }
}

import {
  CommandTopics,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import {
  CreatePaymentIntentCmd,
  CreateQuoteCmd,
  CreatePaymentCmd,
  PaymentIntentAggregate,
  ApprovePaymentCmd
} from 'payments-domain-lib';

export class PaymentsCommandHandler {
  private _msgConsumer: IMessageConsumer;
  private _msgProducer: IMessageProducer;
  private _paymentIntentAggregate: PaymentIntentAggregate;

  constructor(
    msgConsumer: IMessageConsumer,
    msgProducer: IMessageProducer,
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

  private async _handleBatch(messages: IMessage[]): Promise<void> {
    const commandMessages: IMessage[] = [];
    // TODO: route quote and outgoing payment commands to their aggregates
    const unhandled: IMessage[] = [];

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

    const eventsToPublish: IMessage[] = [];

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

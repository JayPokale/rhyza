import {
  CommandTopics,
  EventTopics,
  Message,
  MessageConsumer,
  MessageProducer
} from 'common-types-lib';
import {
  FinalizeRemoteQuoteCmd,
  FailRemoteQuoteCmd
} from 'payments-domain-lib';

// TODO: replace with event classes from ILP BC once they're defined
const ILP_QUOTE_DETERMINED_EVENT = 'QuoteDeterminedEvent';
const ILP_QUOTE_FAILED_EVENT = 'QuoteFailedEvent';

// TODO: finalize payload shapes with ILP BC
// - may want to use more ILP pay langauge (lowEstimatedExchangeRate instead of exhangeRate, maxSourceAmount instead of debitAmount etc.)
// - may want to do more generic `requestId` or similar for correlation instead of paymentIntentId, quoteId etc. then concat them `paymentIntentId:quoteId`
interface IlpQuoteDeterminedPayload {
  quoteId: string;
  paymentIntentId: string;
  debitAmount: number;
  receiveAmount: number;
  exchangeRate: number;
}

interface IlpQuoteFailedPayload {
  quoteId: string;
  paymentIntentId: string;
  errorName: string;
  message: string;
}

export class PaymentsEventHandler {
  private _msgConsumer: MessageConsumer;
  private _msgProducer: MessageProducer;

  constructor(msgConsumer: MessageConsumer, msgProducer: MessageProducer) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([EventTopics.IlpEvents]);
    this._msgConsumer.setCallbackFn(this._handleEvent.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleEvent(message: Message): Promise<void> {
    switch (message.msgName) {
      case ILP_QUOTE_DETERMINED_EVENT: {
        const payload = message.payload as IlpQuoteDeterminedPayload;
        const cmd = new FinalizeRemoteQuoteCmd(
          {
            quoteId: payload.quoteId,
            paymentIntentId: payload.paymentIntentId,
            debitAmount: payload.debitAmount,
            receiveAmount: payload.receiveAmount,
            exchangeRate: payload.exchangeRate
          },
          message.requestId ?? ''
        );
        cmd.msgTopic = CommandTopics.PaymentCommands;
        await this._msgProducer.send(cmd);
        break;
      }
      case ILP_QUOTE_FAILED_EVENT: {
        const payload = message.payload as IlpQuoteFailedPayload;
        const cmd = new FailRemoteQuoteCmd(
          {
            quoteId: payload.quoteId,
            paymentIntentId: payload.paymentIntentId,
            errorName: payload.errorName,
            message: payload.message
          },
          message.requestId ?? ''
        );
        cmd.msgTopic = CommandTopics.PaymentCommands;
        await this._msgProducer.send(cmd);
        break;
      }
      default:
        console.warn(`Unhandled ILP event — msgName: ${message.msgName}`);
    }
  }
}

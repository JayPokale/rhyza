import {
  DomainEventTopics,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import {
  CompleteRemoteQuoteCmd,
  FailRemoteQuoteCmd
} from 'payments-domain-lib';
import { QuoteDeterminedEvent, QuoteFailedEvent } from 'ilp-domain-lib';

// TODO: QuoteDeterminedEvent -> RemoteQuoteReceivedEvent (pending ILP BC rename)
// TODO: QuoteFailedEvent -> QuoteCreateFailedEvent (pending ILP BC rename)

// TODO: once ILP BC updates events to new flow, replace these local interfaces
interface IlpQuoteDeterminedPayload {
  paymentIntentId: string;
  quoteId: string;
  // TODO: ILP BC should pass requestId through from RemoteQuoteRequestedEvent payload so
  // Payments BC can correlate the API response back to the original request.
  requestId: string;
  receiveAmountValue: string;
  receiveAssetCode: string;
  receiveAssetScale: number;
}

interface IlpQuoteFailedPayload {
  paymentIntentId: string;
  quoteId: string;
  // TODO: ILP BC should pass requestId through from RemoteQuoteRequestedEvent payload so
  // Payments BC can correlate the API response back to the original request.
  requestId: string;
  errorName: string;
  message: string;
}

export class PaymentsEventHandler {
  private _msgConsumer: IMessageConsumer;
  private _msgProducer: IMessageProducer;

  constructor(msgConsumer: IMessageConsumer, msgProducer: IMessageProducer) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([DomainEventTopics.IlpEvents]);
    this._msgConsumer.setBatchCallbackFn(async (messages: IMessage[]) => {
      for (const message of messages) {
        await this._handleEvent(message);
      }
    });
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleEvent(message: IMessage): Promise<void> {
    switch (message.msgName) {
      case QuoteDeterminedEvent.name: {
        const payload = message.payload as IlpQuoteDeterminedPayload;
        const cmd = new CompleteRemoteQuoteCmd(
          {
            quoteId: payload.quoteId,
            paymentIntentId: payload.paymentIntentId,
            receiveAmountValue: payload.receiveAmountValue,
            receiveAssetCode: payload.receiveAssetCode,
            receiveAssetScale: payload.receiveAssetScale
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case QuoteFailedEvent.name: {
        const payload = message.payload as IlpQuoteFailedPayload;
        const cmd = new FailRemoteQuoteCmd(
          {
            quoteId: payload.quoteId,
            paymentIntentId: payload.paymentIntentId,
            errorName: payload.errorName,
            message: payload.message
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      default:
        console.warn(`Unhandled ILP event — msgName: ${message.msgName}`);
    }
  }
}

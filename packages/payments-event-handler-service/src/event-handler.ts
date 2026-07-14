import {
  DomainEventTopics,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import { ILPQuoteFailedEvent, ILPQuoteReceivedEvent } from 'ilp-domain-lib';
import {
  CompleteRemoteQuoteCmd,
  FailRemoteQuoteCmd,
  CalculateRemoteQuoteCmd
} from 'payments-domain-lib';

// TODO: pending ILP BC class for inbound remote-quote request. replace stub
// once published from ilp-domain-lib.
// How does ILP want to correlate? remote quote calculation is ephemeral (no quote id).
// packetId? generic correlationId or requestId?
// peerId/paymentIntentId alone probably cant uniquely identify.
const RemoteQuoteRequestReceivedEventName = 'RemoteQuoteRequestReceivedEvent';
interface IlpRemoteQuoteRequestReceivedPayload {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  sourceAmount: string;
  peerAssetCode: string;
  peerAssetScale: number;
  requestId: string;
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
      case ILPQuoteReceivedEvent.name: {
        const { quoteId, paymentIntentId, destinationAmount } =
          message.payload as ILPQuoteReceivedEvent['payload'];
        const cmd = new CompleteRemoteQuoteCmd(
          {
            quoteId,
            paymentIntentId,
            receiveAmountValue: destinationAmount
          },
          // TODO: requestId required - remove fallback when provided by ILP
          message.requestId ?? ''
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case ILPQuoteFailedEvent.name: {
        const payload = message.payload as ILPQuoteFailedEvent['payload'];
        const cmd = new FailRemoteQuoteCmd(
          {
            quoteId: payload.quoteId,
            paymentIntentId: payload.paymentIntentId,
            errorName: payload.rejectCode ?? 'QuoteFailed',
            message:
              payload.rejectMessage ??
              (payload.expired
                ? 'Quote expired'
                : 'Quote could not be determined')
          },
          // TODO: requestId required - remove fallback when provided by ILP
          message.requestId ?? ''
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case RemoteQuoteRequestReceivedEventName: {
        const payload = message.payload as IlpRemoteQuoteRequestReceivedPayload;
        const cmd = new CalculateRemoteQuoteCmd(
          {
            packetId: payload.packetId,
            peerId: payload.peerId,
            paymentIntentId: payload.paymentIntentId,
            sourceAmount: payload.sourceAmount,
            peerAssetCode: payload.peerAssetCode,
            peerAssetScale: payload.peerAssetScale
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

import {
  DomainEventTopics,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import {
  ILPPaymentConfirmedEvent,
  ILPPaymentFailedEvent,
  ILPQuoteFailedEvent,
  ILPQuoteReceivedEvent,
  ILPQuoteRequestReceivedEvent
} from 'ilp-domain-lib';
import {
  CompleteRemoteQuoteCmd,
  FailRemoteQuoteCmd,
  PrepareRemotePaymentCmd,
  FailRemotePaymentCmd,
  ConfirmRemotePaymentCmd,
  RejectRemotePaymentCmd,
  CompleteRemotePaymentCmd,
  ValidateReceivedPaymentCmd,
  AcceptReceivedPaymentCmd,
  FailReceivedPaymentCmd,
  FinalizeReceivedPaymentCmd
} from 'payments-domain-lib';
import {
  LedgerOutgoingTransferReservedEvent,
  LedgerOutgoingTransferInsufficientFundsErrorEvent,
  LedgerOutgoingTransferCommittedEvent,
  LedgerOutgoingTransferRejectedEvent,
  LedgerIncomingTransferReservedEvent,
  LedgerIncomingTransferInsufficientFundsErrorEvent,
  LedgerIncomingTransferRejectedEvent,
  LedgerIncomingTransferCommittedEvent
} from 'pal-public-types-lib';

// TODO: use pal event directly. It needs to be updated with paymentintentId and paymentId
type LedgerTransferPayloadWithPaymentIds = {
  requestId: string;
  transferId: string;
  isError?: boolean;
  errorMessage?: string;
  paymentIntentId: string;
  paymentId: string;
};

// TODO: use pal event directly. It needs to be updated with paymentIntentId
// and receivedPaymentId
type LedgerTransferPayloadWithReceivedPaymentIds = {
  requestId: string;
  transferId: string;
  isError?: boolean;
  errorMessage?: string;
  paymentIntentId: string;
  receivedPaymentId: string;
};

// TODO: ILP BC does not publish this event yet — assumed contract for the
// inbound prepare packet. Replace with the real event type once ILP adds it.
const ILP_PAYMENT_RECEIVED_EVENT_NAME = 'ILPPaymentReceivedEvent';
type ILPPaymentReceivedPayload = {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  sourceAmount: string;
  peerAssetCode: string;
  peerAssetScale: number;
};

export class PaymentsEventHandler {
  private _msgConsumer: IMessageConsumer;
  private _msgProducer: IMessageProducer;

  constructor(msgConsumer: IMessageConsumer, msgProducer: IMessageProducer) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([
      DomainEventTopics.IlpEvents,
      DomainEventTopics.LedgerEvents
    ]);
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
      case ILPQuoteRequestReceivedEvent.name: {
        // TODO: ILP's ILPQuoteRequestReceivedPayload does
        // not currently carry paymentIntentId / sourceAmount / peerAssetCode /
        // peerAssetScale / requestId.
        // const payload =
        //   message.payload as ILPQuoteRequestReceivedEvent['payload'];
        // const cmd = new CalculateRemoteQuoteCmd(
        //   {
        //     packetId: payload.packetId,
        //     peerId: payload.peerId,
        //     paymentIntentId: payload.paymentIntentId,
        //     sourceAmount: payload.incomingAmount,
        //     peerAssetCode: payload.peerAssetCode,
        //     peerAssetScale: payload.peerAssetScale
        //   },
        //   payload.requestId
        // );
        // await this._msgProducer.send(cmd);
        break;
      }
      case ILP_PAYMENT_RECEIVED_EVENT_NAME: {
        const payload = message.payload as ILPPaymentReceivedPayload;
        const cmd = new ValidateReceivedPaymentCmd(
          {
            id: crypto.randomUUID(),
            paymentIntentId: payload.paymentIntentId,
            packetId: payload.packetId,
            peerId: payload.peerId,
            sourceAmount: payload.sourceAmount,
            peerAssetCode: payload.peerAssetCode,
            peerAssetScale: payload.peerAssetScale
          },
          // TODO: requestId required - remove fallback when provided by ILP
          message.requestId ?? ''
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerIncomingTransferReservedEvent.name: {
        // TODO: auto-accepting. Design calls for marking pending-acceptance,
        // webhooking the ASE via Notifications, and the ASE accepting through
        // the admin API.
        const payload =
          message.payload as LedgerTransferPayloadWithReceivedPaymentIds;
        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId: payload.receivedPaymentId,
            paymentIntentId: payload.paymentIntentId,
            ledgerTransferId: payload.transferId
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerIncomingTransferCommittedEvent.name: {
        const payload =
          message.payload as LedgerTransferPayloadWithReceivedPaymentIds;
        const cmd = new FinalizeReceivedPaymentCmd(
          {
            receivedPaymentId: payload.receivedPaymentId,
            paymentIntentId: payload.paymentIntentId
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerIncomingTransferInsufficientFundsErrorEvent.name:
      case LedgerIncomingTransferRejectedEvent.name: {
        const payload =
          message.payload as LedgerTransferPayloadWithReceivedPaymentIds;
        const cmd = new FailReceivedPaymentCmd(
          {
            receivedPaymentId: payload.receivedPaymentId,
            paymentIntentId: payload.paymentIntentId,
            reason: payload.errorMessage ?? 'Ledger transfer failed'
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerOutgoingTransferReservedEvent.name: {
        const payload = message.payload as LedgerTransferPayloadWithPaymentIds;
        const cmd = new PrepareRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId,
            ledgerTransferId: payload.transferId
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerOutgoingTransferInsufficientFundsErrorEvent.name: {
        const payload = message.payload as LedgerTransferPayloadWithPaymentIds;
        const cmd = new FailRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId,
            reason: payload.errorMessage ?? 'Insufficient funds'
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case ILPPaymentConfirmedEvent.name: {
        const payload = message.payload as ILPPaymentConfirmedEvent['payload'];
        const cmd = new ConfirmRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId
          },
          message.requestId ?? ''
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case ILPPaymentFailedEvent.name: {
        const payload = message.payload as ILPPaymentFailedEvent['payload'];
        const cmd = new RejectRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId,
            reason: payload.reason
          },
          message.requestId ?? ''
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerOutgoingTransferCommittedEvent.name: {
        const payload = message.payload as LedgerTransferPayloadWithPaymentIds;
        const cmd = new CompleteRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      case LedgerOutgoingTransferRejectedEvent.name: {
        const payload = message.payload as LedgerTransferPayloadWithPaymentIds;
        const cmd = new FailRemotePaymentCmd(
          {
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId,
            reason: payload.errorMessage
          },
          payload.requestId
        );
        await this._msgProducer.send(cmd);
        break;
      }
      default:
        console.warn(`Unhandled event — msgName: ${message.msgName}`);
    }
  }
}

import {
  CommandMsg,
  DomainEventTopics,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import { RespondToRemoteQuoteCmd, StartRemoteQuoteCmd } from 'ilp-domain-lib';
import {
  RemoteQuoteCalculatedEvent,
  RemoteQuoteCalculationFailedEvent,
  RemoteQuoteRequestedEvent
} from 'payments-public-types-lib';

export class IlpEventHandler {
  constructor(
    private readonly _msgConsumer: IMessageConsumer,
    private readonly _msgProducer: IMessageProducer,
    private readonly _logger: ILogger
  ) {}

  async start(): Promise<void> {
    this._msgConsumer.setTopics([DomainEventTopics.PaymentEvents]);
    this._msgConsumer.setBatchCallbackFn(this._handleBatch.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleBatch(messages: IMessage[]): Promise<void> {
    const commands = messages
      .map((m) => this._toCommand(m))
      .filter((c): c is CommandMsg => c !== undefined);

    if (commands.length > 0) {
      await this._msgProducer.send(commands);
    }
  }

  private _toCommand(message: IMessage): CommandMsg | undefined {
    switch (message.msgName) {
      case RemoteQuoteRequestedEvent.name: {
        const payload = message.payload as RemoteQuoteRequestedEvent['payload'];
        this._logger.debug(
          `Starting remote quote for paymentIntent ${payload.paymentIntentId} to peer ${payload.peerId}`
        );
        return new StartRemoteQuoteCmd(
          {
            peerId: payload.peerId,
            paymentIntentId: payload.paymentIntentId,
            quoteId: payload.quoteId,
            destinationIlpAddress: payload.destinationIlpAddress,
            sourceAmount: payload.sourceAmount,
            sourceAssetCode: payload.senderAssetCode,
            sourceAssetScale: payload.senderAssetScale
          },
          payload.requestId
        );
      }
      case RemoteQuoteCalculatedEvent.name: {
        const payload =
          message.payload as RemoteQuoteCalculatedEvent['payload'];
        this._logger.debug(
          `Calculated quote for packet ${payload.packetId}; responding to peer ${payload.peerId}`
        );
        return new RespondToRemoteQuoteCmd({
          peerId: payload.peerId,
          packetId: payload.packetId,
          destinationAmount: payload.receiveAmount
        });
      }
      case RemoteQuoteCalculationFailedEvent.name: {
        const payload =
          message.payload as RemoteQuoteCalculationFailedEvent['payload'];
        this._logger.debug(
          `Quote calculation failed for packet ${payload.packetId}; sending generic reject`
        );
        // Omitting destinationAmount makes the aggregate emit the generic
        // "could not respond" reject without leaking the reason to the peer.
        return new RespondToRemoteQuoteCmd({
          peerId: payload.peerId,
          packetId: payload.packetId
        });
      }
      default:
        return undefined;
    }
  }
}

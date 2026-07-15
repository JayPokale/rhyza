import {
  ILogger,
  IMessageProducer,
  IMessageConsumer,
  IMessage,
  DomainEventTopics,
  DomainEvent,
  MessageTypes
} from 'common-types-lib';
import {
  ReceivedPaymentValidatedEvent,
  ReceivedPaymentAcceptedEvent,
  ReceivedPaymentFailedEvent,
  RemotePaymentSendApprovedEvent,
  RemotePaymentSendConfirmedEvent,
  RemotePaymentSendRejectedEvent
} from 'payments-public-types-lib';
import {
  PeerAggregate,
  CheckBalanceAndReserveTransferCmd
} from 'pal-domain-lib';
import { LedgerOutgoingTransferSetupFailedEvent } from 'pal-public-types-lib';

/**
 * External event handler for processing integration events from other bounded contexts
 */
export class IntegrationEventHandler {
  private readonly _logger: ILogger;
  private readonly _msgConsumer: IMessageConsumer;
  private readonly _msgProducer: IMessageProducer;
  private readonly _peerAggregate: PeerAggregate;
  private readonly _pendingMessages: IMessage[] = [];

  constructor(
    messageConsumer: IMessageConsumer,
    msgProducer: IMessageProducer,
    peerAggregate: PeerAggregate,
    logger: ILogger
  ) {
    this._logger = logger;
    this._msgConsumer = messageConsumer;
    this._msgProducer = msgProducer;
    this._peerAggregate = peerAggregate;
  }

  private async _handleMessageBatch(messages: IMessage[]) {
    this._logger.info(`Received batch of ${messages.length} messages`);
    // NOTE: we shouldn't log ignored events, they can be the majority

    for (const msg of messages) {
      if (msg.msgType !== MessageTypes.DOMAIN_EVENT) {
        continue;
      }

      await this._handleEvent(msg as DomainEvent);
    }

    if (this._pendingMessages.length > 0) {
      await this._msgProducer.send(this._pendingMessages);
      this._logger.debug(
        `Published ${this._pendingMessages.length} pending messages at the end of the batch`
      );
      this._pendingMessages.length = 0;
    }
  }

  private async _handleEvent(evt: DomainEvent): Promise<void> {
    // if(msg.msgName === "PaymentIntentCreatedEvent") {
    if (evt.msgName === RemotePaymentSendApprovedEvent.name) {
      await this._handleRemotePaymentSendApproved(evt);
    } else if (evt.msgName === RemotePaymentSendConfirmedEvent.name) {
      // create a CommitTransferCmd
    } else if (evt.msgName === RemotePaymentSendRejectedEvent.name) {
      // create a RejectTransferCmd
    } else if (evt.msgName === ReceivedPaymentValidatedEvent.name) {
      // ReserveTransferCmd (INCOMING).
    } else if (evt.msgName === ReceivedPaymentAcceptedEvent.name) {
      // CommitTransferCmd (INCOMING)
    } else if (evt.msgName === ReceivedPaymentFailedEvent.name) {
      // RejectTransferCmd (INCOMING)
    }
  }

  private async _handleRemotePaymentSendApproved(
    evt: DomainEvent
  ): Promise<void> {
    const payload = evt.payload as RemotePaymentSendApprovedEvent['payload'];

    const peer = await this._peerAggregate.getPeerByIlpAddress(
      payload.destinationIlpAddress
    );
    if (!peer?.ledgerAccounts) {
      const errorMessage = `No peer/ledger accounts for ILP address ${payload.destinationIlpAddress}`;
      this._logger.warn(
        `RemotePaymentSendApprovedEvent (paymentId ${payload.paymentId}): ${errorMessage} — failing payment`
      );
      this._pendingMessages.push(
        new LedgerOutgoingTransferSetupFailedEvent(payload.assetCode, {
          requestId: evt.requestId ?? '',
          paymentIntentId: payload.paymentIntentId,
          paymentId: payload.paymentId,
          errorMessage
        })
      );
      return;
    }

    const cmd = new CheckBalanceAndReserveTransferCmd(payload.assetCode, {
      requestId: evt.requestId ?? '',
      transferId: payload.transferId ?? crypto.randomUUID(),
      payerClearingAccountId: peer.ledgerAccounts.aseClearingAccId,
      payerLiquidityAccountId: peer.ledgerAccounts.aseLiquidityAccId,
      suspenseAccountId: peer.ledgerAccounts.suspenseAccId,
      amount: payload.debitAmount,
      amountScale: payload.assetScale,
      transferDirection: 'OUTGOING',
      paymentIntentId: payload.paymentIntentId,
      paymentId: payload.paymentId
    });

    this._pendingMessages.push(cmd);
  }

  async init(): Promise<void> {
    this._msgConsumer.setTopics([DomainEventTopics.PaymentEvents]);
    this._msgConsumer.setBatchCallbackFn(this._handleMessageBatch.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();

    this._logger.info(`${this.constructor.name} initialized`);
  }

  async destroy(): Promise<void> {
    await this._msgConsumer.stop();
    return;
  }
}

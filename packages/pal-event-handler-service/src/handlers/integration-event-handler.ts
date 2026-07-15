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
  CheckBalanceAndReserveTransferCmd,
  ReserveTransferCmd,
  CommitTransferCmd,
  RejectTransferCmd
} from 'pal-domain-lib';
import {
  LedgerCheckBalanceAndReserveOutgoingTransferFailedEvent,
  LedgerOutgoingTransferCommitFailedEvent,
  LedgerOutgoingTransferRejectFailedEvent,
  LedgerIncomingReserveFailedEvent
} from 'pal-public-types-lib';

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
      await this._handleRemotePaymentSendConfirmed(evt);
    } else if (evt.msgName === RemotePaymentSendRejectedEvent.name) {
      await this._handleRemotePaymentSendRejected(evt);
    } else if (evt.msgName === ReceivedPaymentValidatedEvent.name) {
      await this._handleReceivedPaymentValidated(evt);
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

    const peer = await this._peerAggregate.getPeer(payload.peerId);
    if (!peer?.ledgerAccounts) {
      const errorMessage = `No peer/ledger accounts for peer ${payload.peerId}`;
      this._logger.warn(
        `RemotePaymentSendApprovedEvent (paymentId ${payload.paymentId}): ${errorMessage} — failing payment`
      );
      this._pendingMessages.push(
        new LedgerCheckBalanceAndReserveOutgoingTransferFailedEvent(
          payload.assetCode,
          {
            requestId: payload.requestId,
            paymentIntentId: payload.paymentIntentId,
            paymentId: payload.paymentId,
            errorMessage
          }
        )
      );
      return;
    }

    const cmd = new CheckBalanceAndReserveTransferCmd(payload.assetCode, {
      requestId: payload.requestId,
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

  private async _handleRemotePaymentSendConfirmed(
    evt: DomainEvent
  ): Promise<void> {
    const payload = evt.payload as RemotePaymentSendConfirmedEvent['payload'];

    const peer = await this._peerAggregate.getPeer(payload.peerId);
    if (!peer?.ledgerAccounts) {
      // Shouldn't happen — the peer resolved at reserve time. We can't commit
      // nor reject to unwind, which also needs the peer.
      const errorMessage = `No peer/ledger accounts for peer ${payload.peerId}`;
      this._logger.warn(
        `RemotePaymentSendConfirmedEvent (paymentId ${payload.paymentId}): ${errorMessage} — commit failed`
      );
      this._pendingMessages.push(
        new LedgerOutgoingTransferCommitFailedEvent(payload.assetCode, {
          requestId: payload.requestId,
          transferId: payload.ledgerTransferId,
          isError: true,
          errorMessage,
          paymentIntentId: payload.paymentIntentId,
          paymentId: payload.paymentId
        })
      );
      return;
    }

    this._pendingMessages.push(
      new CommitTransferCmd(payload.assetCode, {
        requestId: payload.requestId,
        transferId: payload.ledgerTransferId,
        payerClearingAccountId: peer.ledgerAccounts.aseClearingAccId,
        suspenseAccountId: peer.ledgerAccounts.suspenseAccId,
        payeeClearingAccountId: peer.ledgerAccounts.peerClearingAccId,
        amount: payload.debitAmount,
        amountScale: payload.assetScale,
        transferDirection: 'OUTGOING',
        paymentIntentId: payload.paymentIntentId,
        paymentId: payload.paymentId
      })
    );
  }

  private async _handleRemotePaymentSendRejected(
    evt: DomainEvent
  ): Promise<void> {
    const payload = evt.payload as RemotePaymentSendRejectedEvent['payload'];

    const peer = await this._peerAggregate.getPeer(payload.peerId);
    if (!peer?.ledgerAccounts) {
      // Shouldn't happen — the peer resolved at reserve time. We can't reject
      // to unwind, which also needs the peer.
      const errorMessage = `No peer/ledger accounts for peer ${payload.peerId}`;
      this._logger.warn(
        `RemotePaymentSendRejectedEvent (paymentId ${payload.paymentId}): ${errorMessage} — reject failed`
      );
      this._pendingMessages.push(
        new LedgerOutgoingTransferRejectFailedEvent(payload.assetCode, {
          requestId: payload.requestId,
          transferId: payload.ledgerTransferId,
          isError: true,
          errorMessage,
          paymentIntentId: payload.paymentIntentId,
          paymentId: payload.paymentId
        })
      );
      return;
    }

    this._pendingMessages.push(
      new RejectTransferCmd(payload.assetCode, {
        requestId: payload.requestId,
        transferId: payload.ledgerTransferId,
        payerClearingAccountId: peer.ledgerAccounts.aseClearingAccId,
        suspenseAccountId: peer.ledgerAccounts.suspenseAccId,
        amount: payload.debitAmount,
        amountScale: payload.assetScale,
        transferDirection: 'OUTGOING',
        paymentIntentId: payload.paymentIntentId,
        paymentId: payload.paymentId
      })
    );
  }

  private async _handleReceivedPaymentValidated(
    evt: DomainEvent
  ): Promise<void> {
    const payload = evt.payload as ReceivedPaymentValidatedEvent['payload'];

    const peer = await this._peerAggregate.getPeer(payload.peerId);
    if (!peer?.ledgerAccounts) {
      const errorMessage = `No peer/ledger accounts for peer ${payload.peerId}`;
      this._logger.warn(
        `ReceivedPaymentValidatedEvent (receivedPaymentId ${payload.receivedPaymentId}): ${errorMessage} — failing received payment`
      );
      this._pendingMessages.push(
        new LedgerIncomingReserveFailedEvent(payload.receiveAssetCode, {
          requestId: payload.requestId,
          paymentIntentId: payload.paymentIntentId,
          paymentId: payload.receivedPaymentId,
          errorMessage
        })
      );
      return;
    }

    // INCOMING reserve: peer is the payer, no ASE-liquidity check (plain
    // reserve, not check-balance). Transfer runs in the receiver's-asset ledger.
    this._pendingMessages.push(
      new ReserveTransferCmd(payload.receiveAssetCode, {
        requestId: payload.requestId,
        transferId: crypto.randomUUID(),
        payerClearingAccountId: peer.ledgerAccounts.peerClearingAccId,
        suspenseAccountId: peer.ledgerAccounts.suspenseAccId,
        amount: payload.receiveAmount,
        amountScale: payload.receiveAssetScale,
        transferDirection: 'INCOMING',
        paymentIntentId: payload.paymentIntentId,
        paymentId: payload.receivedPaymentId
      })
    );
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

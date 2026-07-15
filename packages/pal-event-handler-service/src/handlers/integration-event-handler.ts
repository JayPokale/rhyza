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

/**
 * External event handler for processing integration events from other bounded contexts
 */
export class IntegrationEventHandler {
  private readonly _logger: ILogger;
  private readonly _msgConsumer: IMessageConsumer;
  private readonly _msgProducer: IMessageProducer;
  private readonly _pendingMessages: IMessage[] = [];

  constructor(
    messageConsumer: IMessageConsumer,
    msgProducer: IMessageProducer,
    logger: ILogger
  ) {
    this._logger = logger;
    this._msgConsumer = messageConsumer;
    this._msgProducer = msgProducer;
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
      // create a CheckBalanceAndReserveTransferCmd
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

import {DomainEvent, DomainEventTopics, MessageDataFormats} from "common-types-lib";

export abstract class LedgerDomainEvent extends DomainEvent {
  msgDataFormat:MessageDataFormats = MessageDataFormats.JSON;
  msgTopic: string = DomainEventTopics.LedgerEvents;
  protected constructor(aggId: string) {
    super(aggId);
  }

  static isLegerAccountCreatedEvent(evt:DomainEvent):evt is LegerAccountCreatedEvent {
    return evt.msgName === LegerAccountCreatedEvent.name;
  }
  static isLegerTransactionPostedEvent(evt:DomainEvent):evt is LegerTransactionPostedEvent {
    return evt.msgName === LegerTransactionPostedEvent.name;
  }
  static isLegerTransferReservedEvent(evt:DomainEvent):evt is LegerTransferReservedEvent {
    return evt.msgName === LegerTransferReservedEvent.name;
  }
  static isLegerTransferCommitedEvent(evt:DomainEvent):evt is LegerTransferCommitedEvent {
    return evt.msgName === LegerTransferCommitedEvent.name;
  }
  static isLegerTransferRejectedEvent(evt:DomainEvent):evt is LegerTransferRejectedEvent {
    return evt.msgName === LegerTransferRejectedEvent.name;
  }
}

/*
* Domain Events (for now sort of integration events as well)
* */

// low level events
export type LegerAccountCreatedEventPayload = {
  id: string;
  name: string;
  assetCode: string;
  assetDisplayScale: number;
}
export class LegerAccountCreatedEvent extends LedgerDomainEvent {
  payload: LegerAccountCreatedEventPayload;

  constructor(aggId: string, payload: LegerAccountCreatedEventPayload) {
    super(aggId);
    this.payload = payload;
  }
}

export type LegerTransactionPostedEventPayload = {
  id: string;
  debitedAccountId: string;
  creditedAccountId: string;
  amount: string;
  amountScale: number;
  timestamp: number;
}
export class LegerTransactionPostedEvent extends LedgerDomainEvent {
  payload: LegerTransactionPostedEventPayload;

  constructor(aggId: string, payload: LegerTransactionPostedEventPayload) {
    super(aggId);
    this.payload = payload;
  }
}

// high level events
export type LegerTransferResponseEventPayload = {
  requestId: string;
  transactionId: string;

  // for generic error handling (without dedicated error event)
  isError: boolean;
  errorMessage?: string;
}
export class LegerTransferReservedEvent extends LedgerDomainEvent {
  payload: LegerTransferResponseEventPayload;

  constructor(aggId: string, payload: LegerTransferResponseEventPayload) {
    super(aggId);
    this.payload = payload;
    this.requestId = payload.requestId;
  }
}
export class LegerTransferInsufficientFundsErrorEvent extends LedgerDomainEvent {
  payload: LegerTransferResponseEventPayload;

  constructor(aggId: string, requestId: string, transactionId: string) {
    super(aggId);
    this.payload = {
      requestId: requestId,
      transactionId: transactionId,
      isError: true,
      errorMessage: "Insufficient funds"
    };
    this.requestId = requestId;
  }
}


export class LegerTransferCommitedEvent extends LedgerDomainEvent {
  payload: LegerTransferResponseEventPayload;

  constructor(aggId: string, payload: LegerTransferResponseEventPayload) {
    super(aggId);
    this.payload = payload;
    this.requestId = payload.requestId;
  }
}

export class LegerTransferRejectedEvent extends LedgerDomainEvent {
  payload: LegerTransferResponseEventPayload;

  constructor(aggId: string, payload: LegerTransferResponseEventPayload) {
    super(aggId);
    this.payload = payload;
    this.requestId = payload.requestId;
  }
}



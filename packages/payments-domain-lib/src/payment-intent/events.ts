import { DomainEventMsg, EventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'payment';
const AGGREGATE_NAME = 'payment-intents';

export interface PaymentIntentCreatedPayload {
  id: string;
}

export class PaymentIntentCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: PaymentIntentCreatedPayload;

  constructor(payload: PaymentIntentCreatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentIntentCreateFailedPayload {
  errorName: string;
  message: string;
}

export class PaymentIntentCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: PaymentIntentCreateFailedPayload;

  constructor(payload: PaymentIntentCreateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface QuoteCompletedPayload {
  id: string;
}

export class QuoteCompletedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: QuoteCompletedPayload;

  constructor(payload: QuoteCompletedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface QuoteCreateFailedPayload {
  errorName: string;
  message: string;
}

export class QuoteCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: QuoteCreateFailedPayload;

  constructor(payload: QuoteCreateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentCreatedPayload {
  id: string;
}

export class PaymentCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: PaymentCreatedPayload;

  constructor(payload: PaymentCreatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentCreateFailedPayload {
  errorName: string;
  message: string;
}

export class PaymentCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: PaymentCreateFailedPayload;

  constructor(payload: PaymentCreateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface RemoteQuoteRequestedPayload {
  paymentIntentId: string;
  quoteId: string;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  receiverWalletAddress: string;
  senderAssetCode: string;
  senderAssetScale: number;
  receiverAssetCode: string;
  receiverAssetScale: number;
  debitAmount?: string;
  receiveAmount?: string;
  peerId: string;
  destinationIlpAddress: string;
}

export class RemoteQuoteRequestedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: RemoteQuoteRequestedPayload;

  constructor(payload: RemoteQuoteRequestedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.paymentIntentId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface RemoteQuoteFailedPayload {
  errorName: string;
  message: string;
}

export class RemoteQuoteFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: RemoteQuoteFailedPayload;

  constructor(payload: RemoteQuoteFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalPaymentCompletedPayload {
  id: string;
}

export class LocalPaymentCompletedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: LocalPaymentCompletedPayload;

  constructor(payload: LocalPaymentCompletedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalPaymentCompleteFailedPayload {
  errorName: string;
  message: string;
}

export class LocalPaymentCompleteFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: LocalPaymentCompleteFailedPayload;

  constructor(payload: LocalPaymentCompleteFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface RemotePaymentIntentFetchedPayload {
  id: string;
}

export class RemotePaymentIntentFetchedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: RemotePaymentIntentFetchedPayload;

  constructor(payload: RemotePaymentIntentFetchedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface RemotePaymentIntentFetchFailedPayload {
  errorName: string;
  message: string;
}

export class RemotePaymentIntentFetchFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: RemotePaymentIntentFetchFailedPayload;

  constructor(
    payload: RemotePaymentIntentFetchFailedPayload,
    requestId?: string
  ) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

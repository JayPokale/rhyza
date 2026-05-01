import { DomainEvent, DomainEventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'payment';
const AGGREGATE_NAME = 'payment-intents';

export interface PaymentIntentCreatedPayload {
  id: string;
}

export class PaymentIntentCreatedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  payload: PaymentIntentCreatedPayload;

  constructor(payload: PaymentIntentCreatedPayload, requestId?: string) {
    super(payload.id);
    this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentIntentCreateFailedPayload {
  errorName: string;
  message: string;
}

export class PaymentIntentCreateFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: PaymentIntentCreateFailedPayload;

  constructor(payload: PaymentIntentCreateFailedPayload, requestId?: string) {
    super(requestId ?? '');
    this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface QuoteCompletedPayload {
  id: string;
}

export class QuoteCompletedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  payload: QuoteCompletedPayload;

  constructor(payload: QuoteCompletedPayload, requestId?: string) {
    super(payload.id);
    this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface QuoteCreateFailedPayload {
  errorName: string;
  message: string;
}

export class QuoteCreateFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: QuoteCreateFailedPayload;

  constructor(payload: QuoteCreateFailedPayload, requestId?: string) {
    super(requestId ?? '');
    this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentCreatedPayload {
  id: string;
}

export class PaymentCreatedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  payload: PaymentCreatedPayload;

  constructor(payload: PaymentCreatedPayload, requestId?: string) {
    super(payload.id);
    this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface PaymentCreateFailedPayload {
  errorName: string;
  message: string;
}

export class PaymentCreateFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: PaymentCreateFailedPayload;

  constructor(payload: PaymentCreateFailedPayload, requestId?: string) {
    super(requestId ?? '');
    this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalPaymentCompletedPayload {
  id: string;
}

export class LocalPaymentCompletedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  payload: LocalPaymentCompletedPayload;

  constructor(payload: LocalPaymentCompletedPayload, requestId?: string) {
    super(payload.id);
    this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalPaymentCompleteFailedPayload {
  errorName: string;
  message: string;
}

export class LocalPaymentCompleteFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: LocalPaymentCompleteFailedPayload;

  constructor(payload: LocalPaymentCompleteFailedPayload, requestId?: string) {
    super(requestId ?? '');
    this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

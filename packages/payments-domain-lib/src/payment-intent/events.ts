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

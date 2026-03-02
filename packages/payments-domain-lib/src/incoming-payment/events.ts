import { DomainEventMsg, EventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'payment';
const AGGREGATE_NAME = 'incoming-payments';

export interface IncomingPaymentCreatedPayload {
  id: string;
}

export class IncomingPaymentCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  payload: IncomingPaymentCreatedPayload;

  constructor(payload: IncomingPaymentCreatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface IncomingPaymentCreateFailedPayload {
  errorName: string;
  message: string;
}

export class IncomingPaymentCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: IncomingPaymentCreateFailedPayload;

  constructor(
    payload: IncomingPaymentCreateFailedPayload,
    requestId?: string
  ) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

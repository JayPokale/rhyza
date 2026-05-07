import { DomainEventMsg, EventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'ilp';
const AGGREGATE_NAME = 'ilp-peer';

export interface QuoteDeterminedPayload {
  peerId: string;
  paymentIntentId: string;
  quoteId: string;
  maxSourceAmount: bigint;
  minDeliveryAmount: bigint;
  lowEstimatedExchangeRate: number;
}

export class QuoteDeterminedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  payload: QuoteDeterminedPayload;

  constructor(payload: QuoteDeterminedPayload) {
    super();
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export interface QuoteFailedPayload {
  peerId: string;
  paymentIntentId: string;
  quoteId: string;
  rejectCode?: string;
  rejectMessage?: string;
  expired?: boolean;
}

export class QuoteFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: QuoteFailedPayload;

  constructor(payload: QuoteFailedPayload) {
    super();
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export interface RemotePaymentConfirmedPayload {
  peerId: string;
  paymentIntentId: string;
  outgoingPaymentId: string;
  confirmedAt: string;
}

export class RemotePaymentConfirmedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  payload: RemotePaymentConfirmedPayload;

  constructor(payload: RemotePaymentConfirmedPayload) {
    super();
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export const RemotePaymentFailureReason = {
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type RemotePaymentFailureReason =
  keyof typeof RemotePaymentFailureReason;

export interface RemotePaymentFailedPayload {
  peerId: string;
  paymentIntentId: string;
  outgoingPaymentId: string;
  failedAt: string;
  reason: RemotePaymentFailureReason;
}

export class RemotePaymentFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: RemotePaymentFailedPayload;

  constructor(payload: RemotePaymentFailedPayload) {
    super();
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

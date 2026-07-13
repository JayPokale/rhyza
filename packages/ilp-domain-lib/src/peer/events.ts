import { DomainEvent, DomainEventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'ilp';
const AGGREGATE_NAME = 'ilp-peer';

export interface ILPQuoteReceivedPayload {
  peerId: string;
  paymentIntentId: string;
  quoteId: string;
  destinationAmount: string;
}

export class ILPQuoteReceivedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.IlpEvents;
  payload: ILPQuoteReceivedPayload;

  constructor(payload: ILPQuoteReceivedPayload, requestId?: string) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
    this.requestId = requestId;
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

export class QuoteFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: QuoteFailedPayload;

  constructor(payload: QuoteFailedPayload, requestId?: string) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface ILPQuoteRequestReceivedPayload {
  peerId: string;
  packetId: string;
  destinationIlpAddress: string;
  incomingAmount: string;
  expiresAt: string;
}

export class ILPQuoteRequestReceivedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.IlpEvents;
  payload: ILPQuoteRequestReceivedPayload;

  constructor(payload: ILPQuoteRequestReceivedPayload) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export interface ILPPaymentConfirmedPayload {
  peerId: string;
  paymentIntentId: string;
  paymentId: string;
  confirmedAt: string;
}

export class ILPPaymentConfirmedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.IlpEvents;
  payload: ILPPaymentConfirmedPayload;

  constructor(payload: ILPPaymentConfirmedPayload) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export const ILPPaymentFailureReason = {
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type ILPPaymentFailureReason =
  keyof typeof ILPPaymentFailureReason;

export interface ILPPaymentFailedPayload {
  peerId: string;
  paymentIntentId: string;
  paymentId: string;
  failedAt: string;
  reason: ILPPaymentFailureReason;
}

export class ILPPaymentFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: ILPPaymentFailedPayload;

  constructor(payload: ILPPaymentFailedPayload) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

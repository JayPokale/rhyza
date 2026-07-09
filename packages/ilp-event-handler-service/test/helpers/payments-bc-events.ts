import { DomainEvent, DomainEventTopics } from 'common-types-lib';

// Test-only replacements for Payments BC domain events.
const CONTEXT_NAME = 'payments';
const AGGREGATE_NAME = 'payment';

export interface RemoteQuoteCalculatedEventPayload {
  peerId: string;
  packetId: string;
  destinationAmount: string;
}

export class RemoteQuoteCalculatedEvent extends DomainEvent {
  contextName: string = CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  payload: RemoteQuoteCalculatedEventPayload;

  constructor(payload: RemoteQuoteCalculatedEventPayload) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export interface RemoteQuoteCalculationFailedEventPayload {
  peerId: string;
  packetId: string;
  reason?: string;
}

export class RemoteQuoteCalculationFailedEvent extends DomainEvent {
  contextName: string = CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgTopic: string = DomainEventTopics.PaymentEvents;
  isErrorEvent: boolean = true;
  payload: RemoteQuoteCalculationFailedEventPayload;

  constructor(payload: RemoteQuoteCalculationFailedEventPayload) {
    super(payload.peerId);
    this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

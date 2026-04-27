import { DomainEventMsg, EventTopics } from 'common-types-lib';
import { GrantFinalization } from './interfaces';

const BOUNDED_CONTEXT_NAME = 'auth';
const AGGREGATE_NAME = 'grant';

export interface GrantCreatedPayload {
  id: string;
}

export class GrantCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantCreatedPayload;

  constructor(payload: GrantCreatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface GrantCreateFailedPayload {
  errorName: string;
  message: string;
}

export class GrantCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  isErrorEvent: boolean = true;
  payload: GrantCreateFailedPayload;

  constructor(payload: GrantCreateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface GrantFinalizedPayload {
  id: string;
  reason: GrantFinalization;
}

export class GrantFinalizedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantFinalizedPayload;

  constructor(payload: GrantFinalizedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface GrantFinalizeFailedPayload {
  errorName: string;
  message: string;
}

export class GrantFinalizedFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantFinalizeFailedPayload;

  constructor(payload: GrantFinalizeFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
  }
}

export interface GrantInteractionChoicePayload {
  id: string;
  interactId: string;
}

export class GrantInteractionChoiceEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantInteractionChoicePayload;

  constructor(payload: GrantInteractionChoicePayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface GrantInteractionChoiceFailurePayload {
  errName: string;
  message: string;
}

export class GrantInteractionChoiceFailureEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantInteractionChoiceFailurePayload;

  constructor(
    payload: GrantInteractionChoiceFailurePayload,
    requestId?: string
  ) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
  }
}

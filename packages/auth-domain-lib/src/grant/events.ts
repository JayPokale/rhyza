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

export interface GrantContinuePayload {
  id: string;
  result: GrantFinalization;
}

export class GrantContinueEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantContinuePayload;

  constructor(payload: GrantContinuePayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface GrantContinueFailedPayload {
  errorName: string;
  message: string;
}

export class GrantContinueFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: GrantContinueFailedPayload;

  constructor(payload: GrantContinueFailedPayload, requestId?: string) {
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

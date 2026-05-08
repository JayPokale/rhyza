import { DomainEventTopics, DomainEvent } from 'common-types-lib';
import { GrantFinalization } from './interfaces';

const BOUNDED_CONTEXT_NAME = 'auth';
const AGGREGATE_NAME = 'grant';

export interface GrantCreatedPayload {
  id: string;
}

export class GrantCreatedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  payload: GrantCreatedPayload;

  constructor(payload: GrantCreatedPayload) {
    super(payload.id);
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface GrantCreateFailedPayload {
  grantId: string;
  errorName: string;
  message: string;
}

export class GrantCreateFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  isErrorEvent: boolean = true;
  payload: GrantCreateFailedPayload;

  constructor(payload: GrantCreateFailedPayload) {
    super(payload.grantId);
    this.aggregateId = this.msgKey = payload.grantId;
    this.payload = payload;
  }
}

export interface GrantContinuePayload {
  id: string;
  result: GrantFinalization;
}

export class GrantContinueEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  payload: GrantContinuePayload;

  constructor(payload: GrantContinuePayload, requestId?: string) {
    super(payload.id);
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface GrantContinueFailedPayload {
  grantId: string;
  errorName: string;
  message: string;
}

export class GrantContinueFailedEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  payload: GrantContinueFailedPayload;

  constructor(payload: GrantContinueFailedPayload) {
    super(payload.grantId);
    this.aggregateId = this.msgKey = payload.grantId;
    this.payload = payload;
  }
}

export interface GrantInteractionChoicePayload {
  id: string;
  interactId: string;
}

export class GrantInteractionChoiceEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  payload: GrantInteractionChoicePayload;

  constructor(payload: GrantInteractionChoicePayload) {
    super(payload.id);
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface GrantInteractionChoiceFailurePayload {
  grantId: string;
  errName: string;
  message: string;
}

export class GrantInteractionChoiceFailureEvent extends DomainEvent {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = DomainEventTopics.AuthEvents;
  payload: GrantInteractionChoiceFailurePayload;

  constructor(payload: GrantInteractionChoiceFailurePayload) {
    super(payload.grantId);
    this.aggregateId = this.msgKey = payload.grantId;
    this.payload = payload;
  }
}

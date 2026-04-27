import { DomainEventMsg, EventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'auth';
const AGGREGATE_NAME = 'access_token';

export interface AccessTokenCreatedPayload {
  value: string;
}

export class AccessTokenCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: AccessTokenCreatedPayload;

  constructor(payload: AccessTokenCreatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.value;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface AccessTokenCreateFailedPayload {
  errorName: string;
  message: string;
}

export class AccessTokenCreateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  isErrorEvent: boolean = true;
  payload: AccessTokenCreateFailedPayload;

  constructor(payload: AccessTokenCreateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface AccessTokenRotatedPayload {
  oldAccessTokenValue: string;
  newAccessTokenValue: string;
}

export class AccessTokenRotatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: AccessTokenRotatedPayload;

  constructor(payload: AccessTokenRotatedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.oldAccessTokenValue;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface AccessTokenRotateFailedPayload {
  errorName: string;
  message: string;
}

export class AccessTokenRotateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  isErrorEvent: boolean = true;
  payload: AccessTokenRotateFailedPayload;

  constructor(payload: AccessTokenRotateFailedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface AccessTokenRevokedPayload {
  value: string;
}

export class AccessTokenRevokedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  payload: AccessTokenRevokedPayload;

  constructor(payload: AccessTokenRevokedPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.value;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface AccessTokenRevokeFailurePayload {
  errorName: string;
  message: string;
}

export class AccessTokenRevokeFailureEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.AuthEvents;
  isErrorEvent: boolean = true;
  payload: AccessTokenRevokeFailurePayload;

  constructor(payload: AccessTokenRevokeFailurePayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = requestId ?? '';
    this.payload = payload;
    this.requestId = requestId;
  }
}

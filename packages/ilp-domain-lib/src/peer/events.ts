import { DomainEventMsg, EventTopics } from 'common-types-lib';
import { IlpCorrelationIds } from '../commands';
import { IPeer } from './interfaces';

const BOUNDED_CONTEXT_NAME = 'ilp';
const AGGREGATE_NAME = 'ilp-peer';

export interface PeerCreatedPayload {
  correlation: IlpCorrelationIds;
  peer: IPeer;
}

export class PeerCreatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  payload: PeerCreatedPayload;

  constructor(payload: PeerCreatedPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peer.peerId;
    this.payload = payload;
  }
}

export interface PeerUpdatedPayload {
  correlation: IlpCorrelationIds;
  peer: IPeer;
}

export class PeerUpdatedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  payload: PeerUpdatedPayload;

  constructor(payload: PeerUpdatedPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peer.peerId;
    this.payload = payload;
  }
}

export interface PeerCreationFailedPayload {
  correlation: IlpCorrelationIds;
  peerId: string;
  errorName: string;
  message: string;
}

export class PeerCreationFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: PeerCreationFailedPayload;

  constructor(payload: PeerCreationFailedPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

export interface PeerUpdateFailedPayload {
  correlation: IlpCorrelationIds;
  peerId: string;
  errorName: string;
  message: string;
}

export class PeerUpdateFailedEvent extends DomainEventMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = EventTopics.IlpEvents;
  isErrorEvent: boolean = true;
  payload: PeerUpdateFailedPayload;

  constructor(payload: PeerUpdateFailedPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peerId;
    this.payload = payload;
  }
}

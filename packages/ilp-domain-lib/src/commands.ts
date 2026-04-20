import { CommandMsg, CommandTopics } from 'common-types-lib';
import { IPeer } from './peer/interfaces';

const BOUNDED_CONTEXT_NAME = 'ilp';
const AGGREGATE_NAME = 'ilp-peer';

export interface IlpCorrelationIds {
  requestId: string;
  paymentIntentRef: string;
  quoteId?: string;
  outgoingPaymentId?: string;
  packetId?: string;
  peerId?: string;
}

// --- Peer lifecycle --------------------------------------------------------

export interface CreatePeerCmdPayload {
  correlation: IlpCorrelationIds;
  peer: IPeer;
}

export class CreatePeerCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: CreatePeerCmdPayload;

  constructor(payload: CreatePeerCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peer.peerId;
    this.payload = payload;
  }
}

export interface UpdatePeerCmdPayload {
  correlation: IlpCorrelationIds;
  peer: IPeer;
}

export class UpdatePeerCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: UpdatePeerCmdPayload;

  constructor(payload: UpdatePeerCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.peer.peerId;
    this.payload = payload;
  }
}

// --- Outbound flow (triggered by Payments integration events) --------------

export interface StartRemoteQuoteCmdPayload {
  correlation: IlpCorrelationIds;
  destinationIlpAddress: string;
  sourceAmount: bigint;
  sourceAssetCode: string;
  sourceAssetScale: number;
}

export class StartRemoteQuoteCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: StartRemoteQuoteCmdPayload;

  constructor(payload: StartRemoteQuoteCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

export interface StartRemotePaymentCmdPayload {
  correlation: IlpCorrelationIds;
  destinationIlpAddress: string;
  amount: bigint;
  assetCode: string;
  assetScale: number;
  expiresAt: string;
}

export class StartRemotePaymentCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: StartRemotePaymentCmdPayload;

  constructor(payload: StartRemotePaymentCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

// --- Inbound flow and terminal states ---------------------------------

export interface ProcessPreparePacketCmdPayload {
  correlation: IlpCorrelationIds;
  destinationIlpAddress: string;
  amount: bigint;
  executionCondition: string;
  expiresAt: string;
  data?: string;
}

export class ProcessPreparePacketCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: ProcessPreparePacketCmdPayload;

  constructor(payload: ProcessPreparePacketCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

export interface ProcessFulfillPacketCmdPayload {
  correlation: IlpCorrelationIds;
  fulfillment: string;
  fulfilledAt: string;
  data?: string;
}

export class ProcessFulfillPacketCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: ProcessFulfillPacketCmdPayload;

  constructor(payload: ProcessFulfillPacketCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

export interface ProcessRejectPacketCmdPayload {
  correlation: IlpCorrelationIds;
  rejectCode: string;
  rejectMessage: string;
  rejectTriggeredBy?: string;
  rejectedAt: string;
  data?: string;
}

export class ProcessRejectPacketCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: ProcessRejectPacketCmdPayload;

  constructor(payload: ProcessRejectPacketCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

export interface ExpirePacketCmdPayload {
  correlation: IlpCorrelationIds;
  expiredAt: string;
}

export class ExpirePacketCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.IlpCommands;
  payload: ExpirePacketCmdPayload;

  constructor(payload: ExpirePacketCmdPayload) {
    super();
    this.requestId = payload.correlation.requestId;
    this.aggregateId = this.msgKey = payload.correlation.paymentIntentRef;
    this.payload = payload;
  }
}

import { CommandMsg, CommandTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'auth';
const GRANT_AGGREGATE_NAME = 'grant';
const ACCESS_TOKEN_AGGREGATE_NAME = 'access_token';

interface LimitPayload {
  reciever: string;
  assetCode: string;
  assetScale: number;
  debitAmount?: bigint;
  sendAmount?: bigint;
  interval?: string;
}

interface SubjectId {
  format: string;
  id: string;
}

export interface CreateGrantCmdPayload {
  id: string;
  tenantId: string;
  access: {
    identifier?: string;
    type: string;
    actions: string[];
    limits?: LimitPayload;
  }[];
  client?: string;
  interact?: {
    start: string[];
    finish?: {
      method: string;
      uri: string;
      nonce: string;
    };
  };
  subjectIds?: SubjectId[];
}

export class CreateGrantCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: CreateGrantCmdPayload;

  constructor(payload: CreateGrantCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RevokeGrantCmdPayload {
  id: string;
  tenantId: string;
  continueId: string;
  continueToken: string;
}

export class RevokeGrantCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RevokeGrantCmdPayload;

  constructor(payload: RevokeGrantCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface FinalizeGrantCmdPayload {
  id: string; // ID of associated grant.
  finalizationReason: string;
  accessToken?: {
    id: string;
    value: string;
    managementId: string;
    expiresIn: number;
    revokedAt?: string;
  };
}

export class FinalizeGrantCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: FinalizeGrantCmdPayload;

  constructor(payload: FinalizeGrantCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RotateAccessTokenCmdPayload {
  value: string;
}

export class RotateAccessTokenCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = ACCESS_TOKEN_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RotateAccessTokenCmdPayload;

  constructor(payload: RotateAccessTokenCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.value;
    this.payload = payload;
  }
}

export interface InteractionChoiceCmdPayload {
  id: string;
  interactId: string;
  nonce: string;
}

export class InteractionChoiceCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: InteractionChoiceCmdPayload;

  constructor(payload: InteractionChoiceCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface CreateAccessTokenCmdPayload {
  value: string;
  managementId: string;
  expiresIn: number;
  grantId: string;
}

export class CreateAccessTokenCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = ACCESS_TOKEN_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: CreateAccessTokenCmdPayload;

  constructor(payload: CreateAccessTokenCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.value;
    this.payload = payload;
  }
}

export interface RevokeAccessTokenCmdPayload {
  value: string;
}

export class RevokeAccessTokenCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = ACCESS_TOKEN_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RevokeAccessTokenCmdPayload;

  constructor(payload: RevokeAccessTokenCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.value;
    this.payload = payload;
  }
}

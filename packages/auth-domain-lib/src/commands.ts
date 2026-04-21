import { CommandMsg, CommandTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'auth';
const GRANT_AGGREGATE_NAME = 'grant';

interface AmountPayload {
  value: string;
  assetCode: string;
  assetScale: number;
}

interface LimitPayload {
  reciever: string;
  debitAmount?: AmountPayload;
  sendAmount?: AmountPayload;
  interval?: string;
}

export interface CreateGrantCmdPayload {
  id: string;
  tenantId: string;
  accessToken?: {
    access: {
      identifier?: string;
      type: string;
      actions: string[];
      limits?: LimitPayload;
    }[];
  };
  client?: string;
  interact?: {
    start: string[];
    finish?: {
      method: string;
      uri: string;
      nonce: string;
    };
  };
  subject?: {
    sub_ids: {
      format: string;
      id: string;
    }[];
  };
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

export interface RotateTokenCmdPayload {
  id: string; // ID of the associated grant.
  accessTokenId: string;
}

export class RotateTokenCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RotateTokenCmdPayload;

  constructor(payload: RotateTokenCmdPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
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

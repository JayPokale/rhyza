import { CommandMsg, CommandTopics } from 'common-types-lib';
<<<<<<< HEAD

const BOUNDED_CONTEXT_NAME = 'auth';
const GRANT_AGGREGATE_NAME = 'grant';
=======
import { AccessToken } from './authorization-management/interfaces';
import {
  GrantInteractionMethod,
  Subject
} from './grant-negotiation/interfaces';
import { AccessItem } from './shared/interfaces'

const BOUNDED_CONTEXT_NAME = 'auth';
const GRANT_NEGOTIATION_AGGREGATE_NAME = 'grant-negotiation';
const AUTH_MANAGEMENT_AGGREGATE_NAME = 'authorization-management';
>>>>>>> 32339d8 (feat: use shared interfaces)

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

interface JsonWebKey {
  kty: string;
  kid: string;
  use?: string;
  alg: string;
  crv: string;
  x: string;
}

export interface CreateGrantCmdPayload {
  id: string;
  access: {
    identifier?: string;
    type: string;
    actions: string[];
    limits?: LimitPayload;
  }[];
  client?: string | JsonWebKey;
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
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: CreateGrantCmdPayload;

  constructor(payload: CreateGrantCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
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
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RevokeGrantCmdPayload;

  constructor(payload: RevokeGrantCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface ContinueGrantCmdPayload {
  id: string;
  continueId: string;
  continueToken: string;
  interactRef: string;
}

export class ContinueGrantCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = AUTH_MANAGEMENT_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: ContinueGrantCmdPayload;

  constructor(payload: ContinueGrantCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RotateAccessTokenCmdPayload {
  id: string;
  value: string;
  managementId: string;
}

export class RotateAccessTokenCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = AUTH_MANAGEMENT_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RotateAccessTokenCmdPayload;

  constructor(payload: RotateAccessTokenCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RevokeAccessTokenCmdPayload {
  id: string;
  value: string;
  managementId: string;
}

export class RevokeAccessTokenCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RevokeAccessTokenCmdPayload;

  constructor(payload: RevokeAccessTokenCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
    this.payload = payload;
  }
}

<<<<<<< HEAD
export interface InteractionChoiceCmdPayload {
=======
export interface FinishInteractionPayload {
  id: string; // ID of the associated grant.
  interactId: string;
  nonce: string;
  sessionNonce: string;
}

export class FinishInteractionCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: FinishInteractionPayload;

  constructor(payload: FinishInteractionPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface GetGrantDetailsPayload {
  id: string; // ID of the associated grant.
  interactId: string;
  nonce: string;
}

export class GetGrantDetailsCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: GetGrantDetailsPayload;

  constructor(payload: GetGrantDetailsPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface MakeInteractionChoicePayload {
>>>>>>> 32339d8 (feat: use shared interfaces)
  id: string;
  interactId: string;
  nonce: string;
}

class InteractionChoiceCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
<<<<<<< HEAD
  aggregateName: string = GRANT_AGGREGATE_NAME;
=======
  aggregateId: string;
  aggregateName: string = GRANT_NEGOTIATION_AGGREGATE_NAME;
>>>>>>> 32339d8 (feat: use shared interfaces)
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: InteractionChoiceCmdPayload;

  constructor(payload: InteractionChoiceCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.msgKey = payload.id;
    this.payload = payload;
  }
}

export class InteractionApprovedCommand extends InteractionChoiceCommand { }
export class InteractionDeniedCommand extends InteractionChoiceCommand { }

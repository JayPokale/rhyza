import { CommandMsg, CommandTopics } from 'common-types-lib';
import { AccessItem, AccessToken } from './access-token/interfaces';
import { GrantInteractionMethod } from './grant/interfaces';
import { Subject } from './subject/interfaces';

const BOUNDED_CONTEXT_NAME = 'auth';
const AUTH_INTENT_NAME = 'auth-intents';

export interface CreateGrantPayload {
  id: string;
  tenantId: string;
  accessToken?: AccessToken;
  client?: string;
  interact?: GrantInteractionMethod;
  subject?: Subject;
}

export class CreateGrantCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: CreateGrantPayload;

  constructor(payload: CreateGrantPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface ContinueGrantPayload {
  id: string;
  continueId: string;
  continueToken: string;
  interactRef: string;
}

export class ContinueGrantCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: ContinueGrantPayload;

  constructor(payload: ContinueGrantPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RevokeGrantPayload {
  id: string;
  tenantId: string;
  continueId: string;
  continueToken: string;
}

export class RevokeGrantCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RevokeGrantPayload;

  constructor(payload: RevokeGrantPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface IntrospectTokenPayload {
  id: string; // ID of associated grant.
  accessToken: string;
  access: AccessItem[];
}

export class IntrospectTokenCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: IntrospectTokenPayload;

  constructor(payload: IntrospectTokenPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface RotateTokenPayload {
  id: string; // ID of the associated grant.
  accessTokenId: string;
}

export class RotateTokenCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: RotateTokenPayload;

  constructor(payload: RotateTokenPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface StartInteractionPayload {
  id: string; // ID of the associated grant.
  interactId: string;
  nonce: string;
  clientName: string;
  clientUri: string;
}

export class StartInteractionCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: StartInteractionPayload;

  constructor(payload: StartInteractionPayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

export interface FinishInteractionPayload {
  id: string; // ID of the associated grant.
  interactId: string;
  nonce: string;
  sessionNonce: string;
}

export class FinishInteractionCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
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
  id: string;
  interactId: string;
  nonce: string;
}

export class GetGrantDetailsCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
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
  id: string;
  interactId: string;
  nonce: string;
}

export class MakeInteractionChoiceCommand extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = AUTH_INTENT_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.AuthCommands;
  payload: MakeInteractionChoicePayload;

  constructor(payload: MakeInteractionChoicePayload, requestId: string) {
    super();
    this.requestId = requestId;
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

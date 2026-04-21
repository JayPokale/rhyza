export enum AccessType {
  INCOMING_PAYMENT = 'INCOMING_PAYMENT',
  OUTGOING_PAYMENT = 'OUTGOING_PAYMENT',
  QUOTE = 'QUOTE'
}

export interface Amount {
  value: string;
  assetCode: string;
  assetScale: number;
}

export interface AccessLimit {
  receiver: string;
  debitAmount?: Amount;
  sendAmount?: Amount;
  interval?: string;
}

export enum AccessAction {
  CREATE = 'create',
  COMPLETE = 'complete',
  READ = 'read',
  READ_ALL = 'read-all',
  LIST = 'list',
  LIST_ALL = 'list-all'
}

export interface AccessItem {
  type: AccessType;
  limits: AccessLimit;
  actions: AccessAction[];
  identifier?: string;
}

export type NewAccessToken = Omit<AccessToken, 'revokedAt'>;

export type RevokedAccessToken = AccessToken & {
  revokedAt: Date;
};

export interface AccessToken {
  id: string;
  value: string;
  managementId: string;
  expiresIn: number;
  revokedAt?: Date;
}

export interface SubjectId {
  format: string;
  id: string;
}

export interface Subject {
  sub_ids: SubjectId[];
}

export type InteractionChoice =
  | InteractionState.APPROVED
  | InteractionState.DENIED;

export enum InteractionState {
  PENDING = 'pending',
  APPROVED = 'approved',
  DENIED = 'denied'
}

export interface GrantContinuation {
  accessToken: {
    value: string;
  };
  uri: string;
  wait: number;
}

export enum StartMethod {
  REDIRECT = 'redirect'
}

export enum FinishMethod {
  REDIRECT = 'redirect'
}

export interface SubjectId {
  format: string;
  id: string;
}

export interface GrantFinishMethod {
  method: FinishMethod;
  uri: string;
  nonce: string;
}

export interface GrantInteractionMethod {
  start: StartMethod[];
  finish: GrantFinishMethod;
}

export interface AccessRequest {
  actions: AccessAction[];
  identifier?: string;
}

export enum GrantState {
  PROCESSING = 'processing',
  PENDING = 'pending',
  APPROVED = 'approved',
  FINALIZED = 'finalized'
}

export interface Interaction {
  interactRef: string;
  clientNonce: string;
  state: InteractionState;
  expiresIn: number;
}

export interface GrantIntent {
  id: string;
  tenantId: string;
  startMethod: StartMethod[];
  identifier: string;
  continueToken: string;
  continueId: string;
  state: GrantState;
  client?: string;
  subject?: Subject;
  access?: AccessItem[];
  finishMethod?: FinishMethod;
  finishUri?: string;
  interaction?: Interaction;
  lastContinuedAt?: Date;
  lastIssuedAccessToken?: AccessToken;
  accessTokens: Map<string, AccessToken>;
}

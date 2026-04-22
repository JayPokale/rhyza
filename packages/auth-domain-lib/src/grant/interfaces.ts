export enum AccessType {
  INCOMING_PAYMENT = 'INCOMING_PAYMENT',
  OUTGOING_PAYMENT = 'OUTGOING_PAYMENT',
  QUOTE = 'QUOTE'
}

export interface IAmount {
  value: string;
  assetCode: string;
  assetScale: number;
}

export interface IAccessLimit {
  receiver: string;
  debitAmount?: IAmount;
  sendAmount?: IAmount;
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

export interface IAccessItem {
  type: AccessType;
  limits: IAccessLimit;
  actions: AccessAction[];
  identifier?: string;
}

export type NewAccessToken = Omit<IAccessToken, 'revokedAt'>;

export type RevokedAccessToken = IAccessToken & {
  revokedAt: Date;
};

export interface IAccessToken {
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

export interface ISubject {
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

export interface IGrantContinuation {
  accessToken: {
    value: string;
  };
  uri: string;
  wait: number;
}

export enum IStartMethod {
  REDIRECT = 'redirect'
}

export enum IFinishMethod {
  REDIRECT = 'redirect'
}

export interface ISubjectId {
  format: string;
  id: string;
}

export interface IGrantFinishMethod {
  method: IFinishMethod;
  uri: string;
  nonce: string;
}

export interface IGrantInteractionMethod {
  start: IStartMethod[];
  finish: IGrantFinishMethod;
}

export interface IAccessRequest {
  actions: AccessAction[];
  identifier?: string;
}

export enum GrantState {
  PROCESSING = 'processing',
  PENDING = 'pending',
  APPROVED = 'approved',
  FINALIZED = 'finalized'
}

export interface IInteraction {
  interactRef: string;
  clientNonce: string;
  state: InteractionState;
  expiresIn: number;
}

export interface IGrantIntent {
  id: string;
  tenantId: string;
  startMethod: IStartMethod[];
  identifier: string;
  continueToken: string;
  continueId: string;
  state: GrantState;
  client?: string;
  subject?: ISubject;
  access?: IAccessItem[];
  finishMethod?: IFinishMethod;
  finishUri?: string;
  interaction?: IInteraction;
  lastContinuedAt?: Date;
  lastIssuedAccessToken?: IAccessToken;
  accessTokens: Map<string, IAccessToken>;
}

export const AccessType = {
  INCOMING_PAYMENT: 'INCOMING_PAYMENT',
  OUTGOING_PAYMENT: 'OUTGOING_PAYMENT',
  QUOTE: 'QUOTE'
} as const;
export type AccessType = keyof typeof AccessType;

export interface IAccessLimit {
  receiver: string;
  assetCode: string;
  assetScale: number;
  debitAmount?: bigint;
  sendAmount?: bigint;
  interval?: string;
}

export const AccessAction = {
  CREATE: 'CREATE',
  COMPLETE: 'COMPLETE',
  READ: 'READ',
  READ_ALL: 'READ_ALL',
  LIST: 'LIST',
  LIST_ALL: 'LIST_ALL'
} as const;
export type AccessAction = keyof typeof AccessAction;

export interface IAccessItem {
  type: AccessType;
  limits: IAccessLimit;
  actions: AccessAction[];
  identifier?: string;
}

export interface SubjectId {
  format: string;
  id: string;
}

export interface ISubject {
  sub_ids: SubjectId[];
}

export type InteractionChoice =
  | typeof InteractionState.APPROVED
  | typeof InteractionState.DENIED;

export const InteractionState = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DENIED: 'DENIED'
} as const;
export type InteractionState = keyof typeof InteractionState;

export interface IGrantContinuation {
  accessToken: {
    value: string;
  };
  uri: string;
  wait: number;
}

export const IStartMethod = {
  REDIRECT: 'REDIRECT'
} as const;
export type IStartMethod = keyof typeof IStartMethod;

export const IFinishMethod = {
  REDIRECT: 'REDIRECT'
} as const;
export type IFinishMethod = keyof typeof IFinishMethod;

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

export const GrantState = {
  PROCESSING: 'PROCESSING',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  FINALIZED: 'FINALIZED'
} as const;
export type GrantState = keyof typeof GrantState;

export interface IInteraction {
  interactRef: string;
  clientNonce: string;
  state: InteractionState;
  expiresIn: number;
}

export interface IGrant {
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
}

export type NewAccessToken = Omit<IAccessToken, 'revokedAt'>;

export type RevokedAccessToken = IAccessToken & {
  revokedAt: Date;
};

export interface IAccessToken {
  value: string;
  grantId: string;
  managementId: string;
  expiresIn: number;
  revokedAt?: Date;
}

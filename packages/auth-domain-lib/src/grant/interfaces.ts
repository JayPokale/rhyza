import { JWK } from '@interledger/http-signature-utils';

export const AccessType = {
  INCOMING_PAYMENT: 'INCOMING_PAYMENT',
  OUTGOING_PAYMENT: 'OUTGOING_PAYMENT',
  QUOTE: 'QUOTE'
} as const;
export type AccessType = keyof typeof AccessType;

export const InteractiveAccessType: AccessType[] = [
  AccessType.OUTGOING_PAYMENT
] as const;

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
  limits?: IAccessLimit;
  actions: AccessAction[];
  identifier?: string;
}

export interface ISubjectId {
  format: string;
  id: string;
}

export const Interaction = {
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
} as const;
export type Interaction = keyof typeof Interaction;

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
  // transitional states
  PROCESSING: 'PROCESSING',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  // finalized states
  ISSUED: 'ISSUED',
  REVOKED: 'REVOKED',
  REJECTED: 'REJECTED'
} as const;
export type GrantState = keyof typeof GrantState;

export interface IInteraction {
  interactRef: string;
  state?: Interaction;
  expiresInMs: number;
}

export interface IGrant {
  id: string;
  startMethods: IStartMethod[];
  continueToken?: IContinueToken;
  state: GrantState;
  client?: string | IJsonWebKey;
  subjectIds?: ISubjectId[];
  accesses?: IAccessItem[];
  finishNonce?: string;
  finishMethod?: IFinishMethod;
  finishUri?: string;
  interactionNonce?: string;
  interaction?: IInteraction;
  accessTokens: Map<string, IAccessToken>;
}

export interface IAccessToken {
  value: string;
  manageToken: IManageToken;
  expiresInMs: number;
  createdAt: Date;
  revokedAt?: Date;
}

export interface IContinueToken {
  id: string;
  value: string;
  activeAt: Date;
}

export interface IManageToken {
  id: string;
  value: string;
}

export interface IJsonWebKey {
  kty: string;
  kid: string;
  use?: string;
  alg: string;
  crv: string;
  x: string;
}

export function isJWK(obj: unknown): obj is JWK {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as Record<string, unknown>).kid === 'string' &&
    (obj as Record<string, unknown>).alg === 'EdDSA' &&
    (typeof (obj as Record<string, unknown>).use === 'string' ||
      typeof (obj as Record<string, unknown>).use === 'undefined') &&
    (obj as Record<string, unknown>).kty === 'OKP' &&
    (obj as Record<string, unknown>).crv === 'Ed25519' &&
    typeof (obj as Record<string, unknown>).x === 'string'
  );
}

export interface IAccessRequest {
  actions: AccessAction[];
  identifier?: string;
}

export interface IWalletAddressService {
  getWalletAddressKeys(url: string): Promise<IJsonWebKey[]>;
}

export interface IGrantRepository {
  storeMany(grants: IGrant[]): Promise<void>;
  fetchById(id: string): Promise<IGrant | undefined>;
  fetchByIds(ids: string[]): Promise<IGrant[]>;
}

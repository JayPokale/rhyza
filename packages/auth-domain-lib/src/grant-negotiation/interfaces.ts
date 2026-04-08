export interface SubjectId {
  format: string;
  id: string;
}

export interface Subject {
  sub_ids: SubjectId[];
}


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
  finish?: FinishMethod;
  uri: string;
  nonce: string;
}

export interface GrantInteractionMethod {
  start: StartMethod[];
  finish: GrantFinishMethod;
}

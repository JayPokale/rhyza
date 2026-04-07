// export const AccessType = {
//   INCOMING_PAYMENT: 'INCOMING_PAYMENT',
//   OUTGOING_PAYMENT: 'OUTGOING_PAYMENT',
//   QUOTE: 'QUOTE'
// } as const;
// export type AccessType = keyof typeof AccessType;

// TODO: why use const definition and then coercing into type?

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

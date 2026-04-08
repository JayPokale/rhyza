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
  debitAmount: Amount;
  sendAmount: Amount;
  interval: string;
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
  identifier: string;
}
import { CommandMsg, CommandTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'payment';
const PAYMENT_INTENT_AGG_NAME = 'payment-intents';

export interface CreatePaymentIntentCmdPayload {
  id: string;
  receiverWalletAddressId: string;
  receiverWalletAddress: string;
  expiresAt?: string;
  incomingAmount?: number;
  metadata?: string;
}

export class CreatePaymentIntentCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = PAYMENT_INTENT_AGG_NAME;
  msgTopic: string = CommandTopics.PaymentCommands;
  payload: CreatePaymentIntentCmdPayload;

  constructor(payload: CreatePaymentIntentCmdPayload, requestId: string) {
    super(payload.id);
    this.aggregateId = this.msgKey = payload.id;
    this.requestId = requestId;
    this.payload = payload;
  }
}

export interface CreateQuoteCmdPayload {
  id: string;
  paymentIntentId: string;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  debitAmount?: number;
  receiveAmount?: number;
}

export class CreateQuoteCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = PAYMENT_INTENT_AGG_NAME;
  msgTopic: string = CommandTopics.PaymentCommands;
  payload: CreateQuoteCmdPayload;

  constructor(payload: CreateQuoteCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.aggregateId = this.msgKey = payload.paymentIntentId;
    this.requestId = requestId;
    this.payload = payload;
  }
}

export interface CreatePaymentCmdPayload {
  id: string;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  paymentIntentId: string;
  quoteId?: string;
  debitAmount?: number;
}

export class CreatePaymentCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = PAYMENT_INTENT_AGG_NAME;
  msgTopic: string = CommandTopics.PaymentCommands;
  payload: CreatePaymentCmdPayload;

  constructor(payload: CreatePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.aggregateId = this.msgKey = payload.paymentIntentId;
    this.requestId = requestId;
    this.payload = payload;
  }
}

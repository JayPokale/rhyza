import { CommandMsg, CommandTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'payment';
const INCOMING_AGG_NAME = 'incoming-payments';

export interface CreateIncomingPaymentCmdPayload {
  id: string;
  walletAddressId: string;
  expiresAt?: string;
  incomingAmount?: number;
  metadata?: string;
}

export class CreateIncomingPaymentCmd extends CommandMsg {
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateId: string;
  aggregateName: string = INCOMING_AGG_NAME;
  msgKey: string;
  msgTopic: string = CommandTopics.PaymentCommands;
  payload: CreateIncomingPaymentCmdPayload;

  constructor(payload: CreateIncomingPaymentCmdPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.requestId = requestId;
    this.payload = payload;
  }
}

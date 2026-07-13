import { CommandMsg, CommandTopics } from 'common-types-lib';

export abstract class PaymentIntentCommand extends CommandMsg {
  msgTopic: string = CommandTopics.PaymentCommands;

  protected constructor(aggId: string) {
    super(aggId);
    this.msgKey = aggId;
  }

  static isCreatePaymentIntentCmd(
    cmd: CommandMsg
  ): cmd is CreatePaymentIntentCmd {
    return cmd.msgName === CreatePaymentIntentCmd.name;
  }

  static isCreateQuoteCmd(cmd: CommandMsg): cmd is CreateQuoteCmd {
    return cmd.msgName === CreateQuoteCmd.name;
  }

  static isCreatePaymentCmd(cmd: CommandMsg): cmd is CreatePaymentCmd {
    return cmd.msgName === CreatePaymentCmd.name;
  }

  static isApprovePaymentCmd(cmd: CommandMsg): cmd is ApprovePaymentCmd {
    return cmd.msgName === ApprovePaymentCmd.name;
  }

  static isCompleteRemoteQuoteCmd(
    cmd: CommandMsg
  ): cmd is CompleteRemoteQuoteCmd {
    return cmd.msgName === CompleteRemoteQuoteCmd.name;
  }

  static isFailRemoteQuoteCmd(cmd: CommandMsg): cmd is FailRemoteQuoteCmd {
    return cmd.msgName === FailRemoteQuoteCmd.name;
  }

  static isCalculateRemoteQuoteCmd(
    cmd: CommandMsg
  ): cmd is CalculateRemoteQuoteCmd {
    return cmd.msgName === CalculateRemoteQuoteCmd.name;
  }

  static isPrepareRemotePaymentCmd(cmd: CommandMsg): cmd is PrepareRemotePaymentCmd {
    return cmd.msgName === PrepareRemotePaymentCmd.name;
  }

  static isFailRemotePaymentCmd(cmd: CommandMsg): cmd is FailRemotePaymentCmd {
    return cmd.msgName === FailRemotePaymentCmd.name;
  }

  static isConfirmRemotePaymentCmd(
    cmd: CommandMsg
  ): cmd is ConfirmRemotePaymentCmd {
    return cmd.msgName === ConfirmRemotePaymentCmd.name;
  }

  static isRejectRemotePaymentCmd(
    cmd: CommandMsg
  ): cmd is RejectRemotePaymentCmd {
    return cmd.msgName === RejectRemotePaymentCmd.name;
  }
}

export type CreatePaymentIntentCmdPayload = {
  id: string;
  receiverWalletAddressId: string;
  receiverWalletAddress: string;
  expiresAt?: string;
  incomingAmount?: number;
  metadata?: string;
};

export class CreatePaymentIntentCmd extends PaymentIntentCommand {
  payload: CreatePaymentIntentCmdPayload;

  constructor(payload: CreatePaymentIntentCmdPayload, requestId: string) {
    super(payload.id);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type CreateQuoteCmdPayload = {
  id: string;
  paymentIntentId: string;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  debitAmount?: number;
  receiveAmount?: number;
  remoteUrl?: string;
};

export class CreateQuoteCmd extends PaymentIntentCommand {
  payload: CreateQuoteCmdPayload;

  constructor(payload: CreateQuoteCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type CreatePaymentCmdPayload = {
  id: string;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  paymentIntentId: string;
  quoteId?: string;
  debitAmount?: number;
};

export class CreatePaymentCmd extends PaymentIntentCommand {
  payload: CreatePaymentCmdPayload;

  constructor(payload: CreatePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type ApprovePaymentCmdPayload = {
  id: string;
  paymentIntentId: string;
};

export class ApprovePaymentCmd extends PaymentIntentCommand {
  payload: ApprovePaymentCmdPayload;

  constructor(payload: ApprovePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type CancelPaymentCmdPayload = {
  id: string;
  paymentIntentId: string;
  reason?: string;
};

export class CancelPaymentCmd extends PaymentIntentCommand {
  payload: CancelPaymentCmdPayload;

  constructor(payload: CancelPaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type CompleteRemoteQuoteCmdPayload = {
  quoteId: string;
  paymentIntentId: string;
  receiveAmountValue: string;
};

export class CompleteRemoteQuoteCmd extends PaymentIntentCommand {
  payload: CompleteRemoteQuoteCmdPayload;

  constructor(payload: CompleteRemoteQuoteCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type FailRemoteQuoteCmdPayload = {
  quoteId: string;
  paymentIntentId: string;
  errorName: string;
  message: string;
};

export class FailRemoteQuoteCmd extends PaymentIntentCommand {
  payload: FailRemoteQuoteCmdPayload;

  constructor(payload: FailRemoteQuoteCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type CalculateRemoteQuoteCmdPayload = {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  sourceAmount: string;
  peerAssetCode: string;
  peerAssetScale: number;
};

export class CalculateRemoteQuoteCmd extends PaymentIntentCommand {
  payload: CalculateRemoteQuoteCmdPayload;

  constructor(payload: CalculateRemoteQuoteCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type PrepareRemotePaymentCmdPayload = {
  paymentIntentId: string;
  paymentId: string;
  ledgerTransferId: string;
};

export class PrepareRemotePaymentCmd extends PaymentIntentCommand {
  payload: PrepareRemotePaymentCmdPayload;

  constructor(payload: PrepareRemotePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type FailRemotePaymentCmdPayload = {
  paymentIntentId: string;
  paymentId: string;
  reason?: string;
};

export class FailRemotePaymentCmd extends PaymentIntentCommand {
  payload: FailRemotePaymentCmdPayload;

  constructor(payload: FailRemotePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type ConfirmRemotePaymentCmdPayload = {
  paymentIntentId: string;
  paymentId: string;
};

export class ConfirmRemotePaymentCmd extends PaymentIntentCommand {
  payload: ConfirmRemotePaymentCmdPayload;

  constructor(payload: ConfirmRemotePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

export type RejectRemotePaymentCmdPayload = {
  paymentIntentId: string;
  paymentId: string;
  reason?: string;
};

export class RejectRemotePaymentCmd extends PaymentIntentCommand {
  payload: RejectRemotePaymentCmdPayload;

  constructor(payload: RejectRemotePaymentCmdPayload, requestId: string) {
    super(payload.paymentIntentId);
    this.requestId = requestId;
    this.payload = payload;
  }
}

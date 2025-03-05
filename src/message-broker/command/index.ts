"use strict"

import {CommandMsg} from "../message"

export enum Topic {
  "Commands" = "rafiki-commands",
  "IncomingPayments" = "incoming-payment-commands",
  "Quotes" = "quote-commands",
  "OutgoingPaymentsFromQuote" = "outgoing-payment-from-quote-commands",
  "ApiRequest" = "api-request-commands"
}

export interface AmountPayload {
  assetCode: string;
  assetScale: number;
  value: string;
}

export interface CreateIncomingPaymentCmdPayload {
  id?: string;
  walletAddressId: string;
  expiresAt?: Date;
  incomingAmount?: AmountPayload;
}

export class CreateIncomingPaymentCmd extends CommandMsg {
  contextName: string = 'payment'
  aggregateId: string
  aggregateName: string = 'payments'
  msgKey: string
  msgTopic: string = Topic.IncomingPayments
  payload: CreateIncomingPaymentCmdPayload

  constructor(payload: CreateIncomingPaymentCmdPayload) {
    super()
    this.aggregateId = this.msgKey = `${payload.id}`
    this.payload = payload
  }
}

export interface CreateQuoteCmdPayload {
  id?: string;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  debitAmount?: AmountPayload;
  receiveAmount?: AmountPayload;
}

export class CreateQuoteCmd extends CommandMsg {
  contextName: string = 'payment'
  aggregateId: string
  aggregateName: string = 'payments'
  msgKey: string
  msgTopic: string = Topic.Quotes
  payload: CreateQuoteCmdPayload

  constructor(payload: CreateQuoteCmdPayload) {
    super()
    this.aggregateId = this.msgKey = `${payload.id}`
    this.payload = payload
  }
}

export interface CreateOutgoingPaymentFromQuoteCmdPayload {
  id?: string;
  quoteId: string;
  senderWalletAddressId: string;
}

export class CreateOutgoingPaymentFromQuoteCmd extends CommandMsg {
  contextName: string = 'payment'
  aggregateId: string
  aggregateName: string = 'payments'
  msgKey: string
  msgTopic: string = Topic.OutgoingPaymentsFromQuote
  payload: CreateOutgoingPaymentFromQuoteCmdPayload

  constructor(payload: CreateOutgoingPaymentFromQuoteCmdPayload) {
    super()
    this.aggregateId = this.msgKey = `${payload.id}`
    this.payload = payload
  }
}

export interface ApiResponseCmdPayload {
  requestId: string
  response: Object | Error
}

export class ApiResponseCmd extends CommandMsg {
  contextName: string = 'api-request'
  aggregateId: string
  aggregateName: string = 'api-request'
  msgKey: string
  msgTopic: string = Topic.ApiRequest
  payload: ApiResponseCmdPayload

  constructor(payload: ApiResponseCmdPayload) {
    super()
    this.aggregateId = this.msgKey = `${payload.requestId}`
    this.payload = payload
  }
}


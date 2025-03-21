"use strict"

import {CommandMsg} from "../message"

/**
 * Enum representing different topics for message handling or command processing.
 *
 * The `Topic` enum provides topic names associated with specific commands or message types,
 * which can be utilized for routing or handling purposes in the application.
 *
 * - `IncomingPayments`: Represents the topic for incoming payment commands.
 * - `Quotes`: Represents the topic for quote-related commands.
 * - `OutgoingPaymentsFromQuote`: Represents the topic for outgoing payment commands originating from a quote.
 */
export enum Topic {
  "IncomingPayments" = "incoming-payment-commands",
  "Quotes" = "quote-commands",
  "OutgoingPaymentsFromQuote" = "outgoing-payment-from-quote-commands",
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

  constructor(payload: CreateIncomingPaymentCmdPayload, requestId: string) {
    super()
    this.aggregateId = this.msgKey = payload.id!
    this.requestId = requestId
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

  constructor(payload: CreateQuoteCmdPayload, requestId: string) {
    super()
    this.msgKey = this.aggregateId = payload.id!
    this.payload = payload
    this.requestId = requestId
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

  constructor(payload: CreateOutgoingPaymentFromQuoteCmdPayload, requestId: string) {
    super()
    this.msgKey = this.aggregateId = payload.id!
    this.payload = payload
    this.requestId = requestId
  }
}



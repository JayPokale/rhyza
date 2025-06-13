"use strict";


import {CommandMsg} from "./messaging";

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
export enum CommandTopics {
    "PaymentCommands" = "payment-commands",
    "IncomingPayments" = "incoming-payment-commands",
    "Quotes" = "quote-commands",
    "OutgoingPaymentsFromQuote" = "outgoing-payment-commands",
}

const BOUNDED_CONTEXT_NAME= "payment";
const INCOMING_AGG_NAME= "incoming-payments";
const OUTGOING_AGG_NAME= "outgoing-payments";
const QUOTE_AGG_NAME= "quote-payments";

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
    contextName: string = BOUNDED_CONTEXT_NAME;
    aggregateId: string;
    aggregateName: string = INCOMING_AGG_NAME;
    msgKey: string;
    msgTopic: string = CommandTopics.PaymentCommands;
    payload: CreateIncomingPaymentCmdPayload;

    constructor(payload: CreateIncomingPaymentCmdPayload, requestId: string) {
        super();
        this.aggregateId = this.msgKey = payload.id!;
        this.requestId = requestId;
        this.payload = payload;
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
    contextName: string = BOUNDED_CONTEXT_NAME;
    aggregateId: string;
    aggregateName: string = QUOTE_AGG_NAME;
    msgKey: string;
    msgTopic: string = CommandTopics.PaymentCommands;
    payload: CreateQuoteCmdPayload;

    constructor(payload: CreateQuoteCmdPayload, requestId: string) {
        super();
        this.msgKey = this.aggregateId = payload.incomingPaymentId;
        this.payload = payload;
        this.requestId = requestId;
    }
}

export interface CreateOutgoingPaymentCmdPayload {
    id?: string;
    quoteId?: string;
    senderWalletAddressId: string;
    incomingPaymentId: string;
    debitAmount?: AmountPayload;
}

export class CreateOutgoingPaymentCmd extends CommandMsg {
    contextName: string = BOUNDED_CONTEXT_NAME;
    aggregateId: string;
    aggregateName: string = OUTGOING_AGG_NAME;
    msgKey: string;
    msgTopic: string = CommandTopics.PaymentCommands;
    payload: CreateOutgoingPaymentCmdPayload;

    constructor(payload: CreateOutgoingPaymentCmdPayload, requestId: string) {
        super();
        this.msgKey = this.aggregateId = payload.incomingPaymentId;
        this.payload = payload;
        this.requestId = requestId;
    }
}

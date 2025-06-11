/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {Amount, LocalEvent} from "common-types-lib";
import {IlpDetails} from "../ilp-connector";
import {IncomingPayment, OutgoingPayment} from "./payment-types";
import {RemoteIncomingPayment} from "../remote-incoming-payment";

export enum PaymentEventType {
    INCOMING_PAYMENT_CREATED = "INCOMING_PAYMENT_CREATED",
    INCOMING_PAYMENT_COMPLETED = "INCOMING_PAYMENT_COMPLETED",
    OUTGOING_PAYMENT_COMPLETED = "OUTGOING_PAYMENT_COMPLETED",
    REMOTE_OUTGOING_PAYMENT_FUNDED = "REMOTE_OUTGOING_PAYMENT_FUNDED",
    LOCAL_OUTGOING_PAYMENT_FUNDED = "LOCAL_OUTGOING_PAYMENT_FUNDED",
    REMOTE_QUOTE_REQUESTED = "REMOTE_QUOTE_REQUESTED",
    ILP_PAYMENT_PREPARE_PACKET_ACCEPTED = "ILP_PAYMENT_PREPARE_PACKET_ACCEPTED",
    ILP_QUOTE_PREPARE_PACKET_RECEIVED = "ILP_QUOTE_PREPARE_PACKET_RECEIVED",
    ILP_PAYMENT_FULFILL_PACKET_RECEIVED = "ILP_PAYMENT_FULFILL_PACKET_RECEIVED",
    ILP_PAYMENT_PREPARE_PACKET_RECEIVED = "ILP_PAYMENT_PREPARE_PACKET_RECEIVED",
}

export type IncomingPaymentCreatedEvent = LocalEvent & {
    type: PaymentEventType.INCOMING_PAYMENT_CREATED;
    data: {
        incomingPayment: IncomingPayment;
    };
}

export type RemoteOutgoingPaymentFundedEvent = LocalEvent & {
    type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED;
    data: {
        outgoingPaymentId: string;
        debitAmount: Amount;
        // Wont have receiveAmount when creating outgoing payment from remote local incoming payment
        receiveAmount?: Amount;
        quoteExpiresAt?: Date;
        remoteIncomingPaymentUrl: string;
        ilpDetails: IlpDetails;
    };
}

export type IncomingPaymentCompletedEvent = LocalEvent & {
    type: PaymentEventType.INCOMING_PAYMENT_COMPLETED;
    data: {
        incomingPayment: IncomingPayment;
    };
}

export type OutgoingPaymentCompletedEvent = LocalEvent & {
    type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED;
    data: {
        outgoingPayment: OutgoingPayment;
    };
}

export type LocalOutgoingPaymentFundedEvent = LocalEvent & {
    type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED;
    data: {
        outgoingPayment: OutgoingPayment;
        incomingPayment: IncomingPayment;
        senderWalletAddressId: string;
        receiveAmount: Amount;
        debitAmount: Amount;
    };
}

export type RemoteQuoteRequestedEvent = LocalEvent & {
    type: PaymentEventType.REMOTE_QUOTE_REQUESTED;
    data: {
        quote: {
            id: string;
            debitAmount: Amount;
            expiresAt?: Date;
            senderWalletAddressId: string;
        };
        incomingPayment: RemoteIncomingPayment;
    };
}

export type IlpPaymentPreparePacketAcceptedEvent = LocalEvent & {
    type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED;
    data: {
        amount: Amount;
        requestId: string;
        incomingPaymentCompleted: boolean;
    };
}

export type IlpPaymentPreparePacketReceivedEvent = LocalEvent & {
    type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_RECEIVED;
    data: {
        requestId: string;
        incomingPaymentId: string;
        peerId: string;
        amount: bigint;
    };
}

export type IlpPaymentFulfillPacketReceivedEvent = LocalEvent & {
    type: PaymentEventType.ILP_PAYMENT_FULFILL_PACKET_RECEIVED;
    data: {
        requestId: string;
        peerId: string;
        amount: Amount;
        outgoingPaymentId: string;
        didCompleteIncomingPayment: boolean;
    };
}

export type IlpQuotePacketReceivedEvent = LocalEvent & {
    type: PaymentEventType.ILP_QUOTE_PREPARE_PACKET_RECEIVED;
    data: {
        requestId: string;
        peerId: string;
        amount: bigint;
        quoteId: string;
    };
}

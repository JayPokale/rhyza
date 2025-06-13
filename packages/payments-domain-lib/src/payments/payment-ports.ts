"use strict";


import {
    IncomingPayment,
    IncomingPaymentWithNewMicroPaymentUpdate, LocalIncomingPaymentState, MicroPayment,
    OutgoingPayment,
    OutgoingPaymentWithNewMicroPaymentUpdate,
    Quote
} from "./payment-types";

export interface IIncomingPaymentRepository {
    // exists(id: string): Promise<boolean>;

    // store(payment: IncomingPayment): Promise<void>;
    storeMany(incomingPayments: IncomingPayment[]): Promise<void>;

    // fetchById(id: string): Promise<IncomingPayment | undefined>;

    fetchByIds(ids: string[]): Promise<IncomingPayment[]>;

    // updateWithNewMicroPayment(
    //     incomingPayment: IncomingPayment,
    //     update: IncomingPaymentWithNewMicroPaymentUpdate
    // ): Promise<void>;

    updateReceivedAmountAndStateMany(updates:{incomingPaymentId:string, newReceivedAmount:bigint, newState?:LocalIncomingPaymentState}[]): Promise<void>;

    // storeNewMicroPayment(incomingPaymentId:string, microPayment:MicroPayment): Promise<void>;

    storeManyNewMicroPayment(micropayments: { incomingPaymentId:string, microPayment:MicroPayment}[]): Promise<void>;
}

export interface IQuoteRepository {
    // exists(id: string): Promise<boolean>;

    // store(quote: Quote): Promise<void>;
    storeMany(quotes: Quote[]): Promise<void>;

    // fetchById(id: string): Promise<Quote | undefined>;

    fetchByIds(ids: string[]): Promise<Quote[]>;

    // updateAmounts(request: { id: string; amount: bigint }): Promise<void>;
}

export interface IOutgoingPaymentRepository {
    // exists(id: string): Promise<boolean>;

    // store(payment: OutgoingPayment): Promise<void>;
    storeMany(payment: OutgoingPayment[]): Promise<void>;

    // fetchById(id: string): Promise<OutgoingPayment | undefined>;

    fetchByIds(ids: string[]): Promise<OutgoingPayment[]>;

    // updateWithNewMicroPayment(
    //     outgoingPayment: OutgoingPayment,
    //     request: OutgoingPaymentWithNewMicroPaymentUpdate
    // ): Promise<void>;

    // storeNewMicroPayment(outgoingPaymentId:string, microPayment:MicroPayment): Promise<void>;

    storeManyNewMicroPayment(micropayments: { outgoingPaymentId:string, microPayment:MicroPayment}[]): Promise<void>;
}

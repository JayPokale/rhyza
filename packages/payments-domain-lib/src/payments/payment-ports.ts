"use strict";


import {
    IncomingPayment,
    IncomingPaymentWithNewMicroPaymentUpdate, MicroPayment,
    OutgoingPayment,
    OutgoingPaymentWithNewMicroPaymentUpdate,
    Quote
} from "./payment-types";

export interface IIncomingPaymentRepository {
    exists(id: string): Promise<boolean>;

    store(payment: IncomingPayment): Promise<void>;

    fetchById(id: string): Promise<IncomingPayment | undefined>;

    updateWithNewMicroPayment(
        incomingPayment: IncomingPayment,
        update: IncomingPaymentWithNewMicroPaymentUpdate
    ): Promise<void>;

    storeNewMicroPayment(incomingPaymentId:string, microPayment:MicroPayment): Promise<void>;
}

export interface IQuoteRepository {
    exists(id: string): Promise<boolean>;

    store(quote: Quote): Promise<void>;

    fetchById(id: string): Promise<Quote | undefined>;

    updateAmounts(request: { id: string; amount: bigint }): Promise<void>;
}

export interface IOutgoingPaymentRepository {
    exists(id: string): Promise<boolean>;

    store(payment: OutgoingPayment): Promise<void>;

    fetchById(id: string): Promise<OutgoingPayment | undefined>;

    updateWithNewMicroPayment(
        outgoingPayment: OutgoingPayment,
        request: OutgoingPaymentWithNewMicroPaymentUpdate
    ): Promise<void>;

    storeNewMicroPayment(outgoingPaymentId:string, microPayment:MicroPayment): Promise<void>;
}

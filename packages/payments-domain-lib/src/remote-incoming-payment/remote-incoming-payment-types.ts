"use strict";

import {Amount} from "common-types-lib";
import {IlpDetails} from "../ilp-connector/ilp-connector";
import {RemoteIncomingPaymentService} from "./remote-incoming-payment-service";


export type RemoteIncomingPayment = {
    id: string;
    type: "REMOTE";
    ilpDetails: IlpDetails;
}

export type CreateRemoteIncomingPaymentArgs = {
    resourceServerUrl: string;
    expiresAt?: Date;
    incomingAmount?: Amount;
    walletAddressId: string;
}

export interface IRemoteIncomingPaymentService {
    createRemoteIncomingPayment(
        args: CreateRemoteIncomingPaymentArgs
    ): Promise<string>;
    getById(id: string): Promise<RemoteIncomingPayment | undefined>;
}

export interface IRemoteIncomingPaymentRepository {
    store(payment: RemoteIncomingPayment): Promise<void>;
    fetchById(id: string): Promise<RemoteIncomingPayment | undefined>;
}
"use strict";


import {
    CreateRemoteIncomingPaymentArgs, RemoteIncomingPayment,
    IRemoteIncomingPaymentRepository,
    IRemoteIncomingPaymentService
} from "./remote-incoming-payment-types";
import {ILogger} from "common-types-lib";

export class RemoteIncomingPaymentService implements IRemoteIncomingPaymentService {
    private _logger: ILogger
    private _remoteIncomingPaymentRepository: IRemoteIncomingPaymentRepository

    constructor(
        remoteIncomingPaymentRepository: IRemoteIncomingPaymentRepository,
        logger: ILogger,
    ) {
        
        this._remoteIncomingPaymentRepository = remoteIncomingPaymentRepository;
        this._logger = logger;
    }

    public async createRemoteIncomingPayment(
        args: CreateRemoteIncomingPaymentArgs
    ): Promise<string> {
        const {expiresAt, incomingAmount, walletAddressId, resourceServerUrl} =
            args;

        // TODO: Open Payments client
        let res;
        try {
            res = await fetch(`${resourceServerUrl}/incoming-payment`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    walletAddressId,
                    expiresAt,
                    ...(incomingAmount
                        ? {
                            assetScale: incomingAmount.assetScale,
                            assetCode: incomingAmount.assetCode,
                            value: incomingAmount.value,
                        }
                        : {}),
                }),
            });
        } catch (err) {
            this._logger.error(
                {
                    walletAddressId,
                    resourceServerUrl,
                    err,
                },
                "Error creating incoming payment at remote"
            );
        }

        if (!res!.ok) {
            const errorMessage =
                "Got non 2XX response when creating incoming payment";
            this._logger.error(
                {
                    walletAddressId,
                    resourceServerUrl,
                    status: res!.status,
                },
                errorMessage
            );

            throw new Error(errorMessage);
        }

        const remoteIncomingPayment = (await res!.json()) as RemoteIncomingPayment;

        await this._remoteIncomingPaymentRepository.store(remoteIncomingPayment);

        return remoteIncomingPayment.id;
    }

    public async getById(id: string): Promise<RemoteIncomingPayment | undefined> {
        return this._remoteIncomingPaymentRepository.fetchById(id);
    }
}

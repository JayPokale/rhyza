"use strict";

import {ILogger} from "common-types-lib";
import {ILiquidityService} from "payments-domain-lib";
import { LiquidityRequest } from "liquidity-types-lib";

export class LiquidityServiceClient implements ILiquidityService {
    private _liquidityServiceUrl: string;
    private _logger: ILogger;

    constructor(liquidityServiceUrl: string, logger: ILogger) {
        this._liquidityServiceUrl = liquidityServiceUrl;
        this._logger = logger;
    }

    public async execute(requests: LiquidityRequest[]): Promise<void> {
        const stringifiedValue = JSON.stringify(requests, (key, val) => {
            if (typeof val === "bigint") {
                return val.toString();
            }
            return val;
        });

        await this.sendRequest(
            this._liquidityServiceUrl + "/transfers",
            stringifiedValue
        );
    }

    public async createAssetAccount(asset: {
        id: string;
        scale: number;
        code: string;
    }): Promise<void> {
        await this.sendRequest(
            this._liquidityServiceUrl + "/asset-account",
            JSON.stringify(asset)
        );
    }

    public async createWalletAddressAccount(walletAddress: {
        id: string;
        assetScale: number;
        assetCode: string;
    }): Promise<void> {
        await this.sendRequest(
            this._liquidityServiceUrl + "/wallet-address-account",
            JSON.stringify(walletAddress)
        );
    }

    public async createIlpPeerAccount(ilpPeer: {
        id: string;
        assetScale: number;
        assetCode: string;
    }): Promise<void> {
        await this.sendRequest(
            this._liquidityServiceUrl + "/ilp-peer-account",
            JSON.stringify(ilpPeer)
        );
    }

    private async sendRequest(url: string, body: string): Promise<void> {
        const response = await fetch(url, {
            method: "POST",
            body,
            headers: {
                "content-type": "application/json",
            },
        });

        if (!response.ok) {
            const errorMessage = "Could not make request to liquidity service";

            this._logger.error({status: response.status, url}, errorMessage);
            throw new Error(errorMessage);
        }
    }
}

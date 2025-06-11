/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {IWalletAddressAccountRepository} from "../domain/interfaces";
import {Pool} from "pg";
import {WalletAddressAccount} from "../domain/types";
import {ILogger} from "common-types-lib";

interface WalletAddressAccountRecord {
    id: string;
    asset_code: string;
    asset_scale: number;
    liquidity_account_id: string;
}

const TABLE_NAME = "wallet_address_accounts";

export class WalletAddressAccountPsqlRepository implements IWalletAddressAccountRepository {
    private _pool: Pool;
    private _logger: ILogger;
    private _cache: Map<string, WalletAddressAccount> = new Map();

    constructor(pool:Pool, logger: ILogger) {
        this._pool = pool;
        this._logger = logger;
    }

    public async exists(id: string): Promise<boolean> {
        if (this._cache.has(id)) {
            return true;
        }

        try {
            const res = await this._pool.query(
                `SELECT EXISTS(SELECT 1 FROM ${TABLE_NAME} WHERE id = $1)`,
                [id]
            );
            return res.rows[0].exists;
        } catch (error) {
            this._logger.error(
                {error},
                "Error checking if wallet address account exists"
            );
            throw error;
        }
    }

    public async store(walletAddressAccount: WalletAddressAccount): Promise<void> {
        try {
            const query = `
                INSERT INTO ${TABLE_NAME}
                    (id, asset_code, asset_scale, liquidity_account_id)
                VALUES ($1, $2, $3, $4)
            `;
            const values = [
                walletAddressAccount.id,
                walletAddressAccount.assetCode,
                walletAddressAccount.assetScale,
                walletAddressAccount.liquidityAccountId,
            ];

            await this._pool.query(query, values);
            this._cache.set(walletAddressAccount.id, walletAddressAccount);
        } catch (error) {
            this._logger.error({error}, "Error storing wallet address account");
            throw error;
        }
    }

    public async fetchById(id: string): Promise<WalletAddressAccount | undefined> {
        const cached = this._cache.get(id);

        if (cached) {
            return cached;
        }

        const res = await this._pool.query<WalletAddressAccountRecord>(
            `SELECT id, asset_code, asset_scale, liquidity_account_id
             FROM ${TABLE_NAME}
             WHERE id = $1`,
            [id]
        );

        if (res.rows.length === 0) return undefined;

        const row = res.rows[0];

        const walletAddressAccount = {
            id: row.id,
            assetCode: row.asset_code,
            assetScale: row.asset_scale,
            liquidityAccountId: row.liquidity_account_id,
        };

        this._cache.set(id, walletAddressAccount);

        return walletAddressAccount;
    }
}

/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import type {Pool} from "pg";
import type {Logger} from "pino";
import {ICache, WalletAddress} from "common-types-lib";
import {IWalletAddressRepository} from "payments-domain-lib";

interface IWalletAddressRecord {
    id: string;
    url: string;
    is_active: boolean;
    asset_code: string;
    asset_scale: number;
}

export class WalletAddressPsqlRepository implements IWalletAddressRepository {
    private TABLE_NAME = "wallet_addresses";
    private CACHE_BY_ID_PREFIX = "wallet_address_by_id:";

    constructor(
        private cache: ICache<WalletAddress>,
        private pool: Pool,
        private logger: Logger
    ) {
    }

    public async fetchById(id: string): Promise<WalletAddress | undefined> {
        const cached = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
        if (cached) return cached;

        try {
            const res = await this.pool.query<IWalletAddressRecord>(
                `SELECT id, url, is_active, asset_code, asset_scale
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
                [id]
            );

            if (res.rows.length === 0) return undefined;

            const row = res.rows[0];
            const walletAddress: WalletAddress = {
                id: row.id,
                url: row.url,
                isActive: row.is_active,
                assetCode: row.asset_code,
                assetScale: row.asset_scale,
            };

            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + walletAddress.id,
                walletAddress
            );
            return walletAddress;
        } catch (error) {
            this.logger.error("Error fetching wallet address by ID:", error);
            throw error;
        }
    }

    public async fetchByIds(ids: string[]): Promise<WalletAddress[]>{
        const foundInCache: WalletAddress[] = [];
        const idsNotFoundInCache: string[] = [];

        for(const id of ids) {
            const found = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
            if(found){
                foundInCache.push(found);
            }else{
                idsNotFoundInCache.push(id)
            }
        }

        if(foundInCache.length === ids.length) {
            return foundInCache;
        }

        try {
            const res = await this.pool.query<IWalletAddressRecord>(
                `SELECT id, url, is_active, asset_code, asset_scale
                 FROM ${this.TABLE_NAME}
                 WHERE id in ($1)`,
                [idsNotFoundInCache.join(",")]
            );

            if (res.rows.length === 0) return [];

            const walletAddresses: WalletAddress[] = res.rows.map((row)=>{
                return {
                    id: row.id,
                    url: row.url,
                    isActive: row.is_active,
                    assetCode: row.asset_code,
                    assetScale: row.asset_scale
                }
            });

            if(walletAddresses.length >0) {
                foundInCache.push(...walletAddresses);

                // update cache
                for (const walletAddr of walletAddresses) {
                    await this.cache.set( this.CACHE_BY_ID_PREFIX + walletAddr.id,  walletAddr);
                }
            }

            return foundInCache;
        } catch (error) {
            this.logger.error("Error fetching wallet address by ID:", error);
            throw error;
        }
    }

    public async exists(id: string): Promise<boolean> {
        const found = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
        if (found) return true;

        try {
            const res = await this.pool.query(
                `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
                [id]
            );
            return res.rows[0].exists;
        } catch (error) {
            this.logger.error("Error checking if wallet address exists:", error);
            throw error;
        }
    }

    public async store(walletAddress: WalletAddress): Promise<void> {
        try {
            const query = `
                INSERT INTO ${this.TABLE_NAME} (id, url, is_active, asset_code, asset_scale)
                VALUES ($1, $2, $3, $4, $5)
            `;

            const values = [
                walletAddress.id,
                walletAddress.url,
                walletAddress.isActive,
                walletAddress.assetCode,
                walletAddress.assetScale,
            ];

            await this.pool.query(query, values);
            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + walletAddress.id,
                walletAddress
            );
        } catch (error) {
            this.logger.error("Error storing wallet address:", error);
            throw error;
        }
    }
}

export class WalletAddressInMemoryRepository implements IWalletAddressRepository {
    map: Map<string, WalletAddress> = new Map();

    public async store(entity: WalletAddress): Promise<void> {
        this.map.set(entity.id, entity);
    }

    public async fetchById(id: string): Promise<WalletAddress | undefined> {
        return this.map.get(id);
    }

    public async fetchByIds(ids: string[]): Promise<WalletAddress[]>{
        return Array.from(this.map.values()).filter(item => ids.includes(item.id));
    }

    public async exists(id: string): Promise<boolean> {
        return this.map.has(id);
    }
}

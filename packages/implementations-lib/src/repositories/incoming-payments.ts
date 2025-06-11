/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {
    IIncomingPaymentRepository, IncomingPayment,
    IncomingPaymentWithMicroPayments, IncomingPaymentWithNewMicroPaymentUpdate, LocalIncomingPaymentState,
    MicroPayment
} from "payments-domain-lib";
import type {Pool} from "pg";
import type {Logger} from "pino";
import {ICache} from "common-types-lib";

interface IIncomingPaymentRecord {
    id: string;
    expires_at: string;
    asset_code: string;
    asset_scale: number;
    incoming_amount: string | null;
    received_amount: string;
    state: string;
    wallet_address_id: string;
}

export class IncomingPaymentPsqlRepository implements IIncomingPaymentRepository {
    private TABLE_NAME = "incoming_payments";
    private MICRO_PAYMENT_TABLE_NAME = "incoming_micro_payments";
    private CACHE_BY_ID_PREFIX = "incoming_payment_by_id:";

    constructor(
        private cache: ICache<IncomingPayment>,
        private pool: Pool,
        private logger: Logger
    ) {
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
            this.logger.error("Error checking if incoming payment exists:", error);
            throw error;
        }
    }

    public async store(incomingPayment: IncomingPayment): Promise<void> {
        try {
            const query = `
                INSERT INTO ${this.TABLE_NAME}
                (id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, state, wallet_address_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `;
            const values = [
                incomingPayment.id,
                incomingPayment.expiresAt.toISOString(),
                incomingPayment.asset.code,
                incomingPayment.asset.scale,
                incomingPayment.incomingAmount
                    ? incomingPayment.incomingAmount.toString()
                    : null,
                incomingPayment.receivedAmount.toString(),
                incomingPayment.state,
                incomingPayment.walletAddressId,
            ];

            await this.pool.query(query, values);
            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + incomingPayment.id,
                incomingPayment
            );
        } catch (error) {
            this.logger.error("Error storing incoming payment:", error);
            throw error;
        }
    }

    public async storeNewMicroPayment(
        incomingPaymentId:string,
        microPayment:MicroPayment
    ): Promise<void>{
        const client = await this.pool.connect();

        try {
            const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME}
                                     (id, incoming_payment_id, method, ilp_peer_id, request_id, amount)
                                 VALUES ($1, $2, $3, $4, $5, $6)
            `;

            const insertValues = [
                crypto.randomUUID(),
                incomingPaymentId,
                microPayment.method,
                microPayment.ilpPeerId || null,
                microPayment.requestId,
                microPayment.amount,
            ];

            await client.query(insertQuery, insertValues);
        } catch (error) {
            await client.query("ROLLBACK");
            this.logger.error(
                "Error inserting micro-payment:",
                error
            );
            throw error;
        } finally {
            client.release();
        }
    }

    public async updateWithNewMicroPayment(
        incomingPayment: IncomingPayment,
        update: IncomingPaymentWithNewMicroPaymentUpdate
    ): Promise<void> {
        const {state, receivedAmount, microPayment} = update;
        const {id} = incomingPayment;
        const client = await this.pool.connect();

        try {
            await client.query("BEGIN");

            const updateFields = ["received_amount = $2"];
            const updateValues: (string | bigint)[] = [id, receivedAmount];

            if (state !== undefined && state !== null) {
                updateFields.push("state = $3");
                updateValues.push(state);
            }

            const updateQuery = `UPDATE ${this.TABLE_NAME}
                                 SET ${updateFields.join(", ")}
                                 WHERE id = $1
            `;

            await client.query(updateQuery, updateValues);

            const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME}
                                     (id, incoming_payment_id, method, ilp_peer_id, request_id, amount)
                                 VALUES ($1, $2, $3, $4, $5, $6)
            `;

            const insertValues = [
                crypto.randomUUID(),
                id,
                microPayment.method,
                microPayment.ilpPeerId || null,
                microPayment.requestId,
                microPayment.amount,
            ];

            await client.query(insertQuery, insertValues);

            await client.query("COMMIT");
            this.cache.set(this.CACHE_BY_ID_PREFIX + id, incomingPayment);
        } catch (error) {
            await client.query("ROLLBACK");
            this.logger.error(
                "Error updating incoming payment and inserting micro payment:",
                error
            );
            throw error;
        } finally {
            client.release();
        }
    }

    public async fetchById(id: string): Promise<IncomingPayment | undefined> {
        const cached = await this.cache.get(id);
        if (cached) return cached;

        try {
            const res = await this.pool.query<IIncomingPaymentRecord>(
                `SELECT id,
                        expires_at,
                        asset_code,
                        asset_scale,
                        incoming_amount,
                        received_amount,
                        state,
                        wallet_address_id
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
                [id]
            );

            if (res.rows.length === 0) return undefined;

            const row = res.rows[0];

            const incomingPayment: IncomingPayment = {
                id: row.id,
                expiresAt: new Date(row.expires_at),
                asset: {
                    code: row.asset_code,
                    scale: row.asset_scale,
                },
                incomingAmount: row.incoming_amount
                    ? BigInt(row.incoming_amount)
                    : undefined,
                receivedAmount: BigInt(row.received_amount),
                state: row.state as LocalIncomingPaymentState,
                walletAddressId: row.wallet_address_id,
                type: "LOCAL",
            };

            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + incomingPayment.id,
                incomingPayment
            );
            return incomingPayment;
        } catch (error) {
            this.logger.error("Error fetching incoming payment by ID:", error);
            throw error;
        }
    }

    public async fetchWithMicroPaymentsById(
        id: string
    ): Promise<IncomingPaymentWithMicroPayments | undefined> {
        throw new Error("not implemented");
    }
}

export class IncomingPaymentInMemoryRepository implements IIncomingPaymentRepository {
    private map: Map<string, IncomingPayment> = new Map();
    private microPaymentMap: Map<string, MicroPayment[]> = new Map();

    public async store(payment: IncomingPayment): Promise<void> {
        this.map.set(payment.id, payment);
    }

    public async fetchById(id: string): Promise<IncomingPayment | undefined> {
        return this.map.get(id);
    }

    public async exists(id: string): Promise<boolean> {
        return this.map.has(id);
    }

    public async storeNewMicroPayment(
        incomingPaymentId:string,
        microPayment:MicroPayment
    ): Promise<void>{
        const outgoingPaymentMicroPayments = this.microPaymentMap.get(incomingPaymentId);

        if(!outgoingPaymentMicroPayments){
            this.microPaymentMap.set(incomingPaymentId, [microPayment]);
        }else{
            outgoingPaymentMicroPayments.push(microPayment);
        }
    }

    public async updateWithNewMicroPayment(
        incomingPayment: IncomingPayment,
        update: IncomingPaymentWithNewMicroPaymentUpdate
    ): Promise<void> {
        const {state, receivedAmount, microPayment} = update;
        const {id} = incomingPayment;
        const payment = this.map.get(id);
        if (!payment) {
            throw new Error(`IncomingPayment with id ${id} not found`);
        }

        if (state) {
            payment.state = state;
        }
        payment.receivedAmount = receivedAmount;

        await this.storeNewMicroPayment(id, microPayment);
    }

    public async delete(id: string): Promise<void> {
        if (this.map.has(id)) {
            this.map.delete(id);
        }
        if (this.microPaymentMap.has(id)) {
            this.microPaymentMap.delete(id);
        }
    }
}

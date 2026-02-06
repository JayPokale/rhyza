/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

import type { Pool } from 'pg'
import type { Logger } from 'pino'
import {
  IncomingPayment,
  IOutgoingPaymentRepository,
  LocalIncomingPaymentState,
  MicroPayment,
  OutgoingPayment,
  OutgoingPaymentState,
  OutgoingPaymentWithMicroPayments,
  OutgoingPaymentWithNewMicroPaymentUpdate
} from 'payments-domain-lib'
import { ICache } from 'common-types-lib'

type OutgoingPaymentRecord = {
  id: string
  quote_id: string
  asset_code: string
  asset_scale: number
  state: string
  sent_amount: string
  debit_amount: string
  local_incoming_payment_id: string | null
  remote_incoming_payment_url: string | null
  sender_wallet_address_id: string
}

export class OutgoingPaymentPsqlRepository
  implements IOutgoingPaymentRepository
{
  private TABLE_NAME = 'outgoing_payments'
  private MICRO_PAYMENT_TABLE_NAME = 'outgoing_micro_payments'
  private CACHE_BY_ID_PREFIX = 'outgoing_payment_by_id:'

  constructor(
    private cache: ICache<OutgoingPayment>,
    private pool: Pool,
    private logger: Logger
  ) {}

  public async fetchByIds(ids: string[]): Promise<OutgoingPayment[]> {
    const retList: OutgoingPayment[] = []
    const idsNotFoundInCache: string[] = []

    for (const id of ids) {
      const found = await this.cache.get(this.CACHE_BY_ID_PREFIX + id)
      if (found) {
        retList.push(found)
      } else {
        idsNotFoundInCache.push(id)
      }
    }

    if (retList.length === ids.length) {
      return retList
    }

    try {
      const query = `SELECT id, quote_id, asset_code, asset_scale, state, sent_amount, debit_amount, local_incoming_payment_id, remote_incoming_payment_url, sender_wallet_address_id FROM ${this.TABLE_NAME} WHERE id = ANY($1)`
      const res = await this.pool.query(query, [idsNotFoundInCache])

      if (res.rows.length > 0) {
        for (const dbObj of res.rows as OutgoingPaymentRecord[]) {
          const obj: OutgoingPayment = {
            id: dbObj.id,
            quoteId: dbObj.quote_id,
            asset: {
              code: dbObj.asset_code,
              scale: dbObj.asset_scale
            },
            state: dbObj.state as OutgoingPaymentState,
            sentAmount: BigInt(dbObj.sent_amount),
            debitAmount: BigInt(dbObj.debit_amount),
            localIncomingPaymentId:
              dbObj.local_incoming_payment_id ?? undefined,
            remoteIncomingPaymentUrl:
              dbObj.remote_incoming_payment_url ?? undefined,
            senderWalletAddressId: dbObj.sender_wallet_address_id
          }

          // add to return list
          retList.push(obj)

          // update cache
          await this.cache.set(this.CACHE_BY_ID_PREFIX + obj.id, obj)
        }
      }

      return retList
    } catch (error) {
      this.logger.error('Error fetching outgoing payment by ids:', error)
      throw error
    }
  }

  public async storeMany(outgoingPayments: OutgoingPayment[]): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        let query = `
                    INSERT INTO ${this.TABLE_NAME}
                    (id, quote_id, asset_code, asset_scale, state, sent_amount, debit_amount,
                     local_incoming_payment_id, remote_incoming_payment_url,
                     sender_wallet_address_id)
                    VALUES
                `
        const valuesString: string[] = []
        outgoingPayments.forEach((item: OutgoingPayment) => {
          valuesString.push(`('${item.id}', '${item.quoteId}',
                    '${item.asset.code}', ${item.asset.scale}, '${item.state}',
                    '${item.sentAmount.toString()}', '${item.debitAmount.toString()}', '${item.localIncomingPaymentId}',
                    '${item.remoteIncomingPaymentUrl}', '${item.senderWalletAddressId}')`)
        })

        query += ' ' + valuesString.join(',')

        await this.pool.query(query)

        for (const item of outgoingPayments) {
          await this.cache.set(this.CACHE_BY_ID_PREFIX + item.id, item)
        }

        return resolve()
      } catch (error) {
        this.logger.error('Error storing incoming payment:', error)
        reject(error)
      }
    })
  }

  public async storeManyNewMicroPayment(
    micropayments: { outgoingPaymentId: string; microPayment: MicroPayment }[]
  ): Promise<void> {
    try {
      let query = `
                INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME}
                (id, outgoing_payment_id, method, ilp_peer_id, request_id, amount)
                VALUES
            `
      const valuesString: string[] = []
      micropayments.forEach((item) => {
        valuesString.push(`('${crypto.randomUUID()}', '${item.outgoingPaymentId}', '${item.microPayment.method}',
                ${item.microPayment.ilpPeerId ? "'" + item.microPayment.ilpPeerId + "'" : null}, '${item.microPayment.requestId}', ${item.microPayment.amount})`)
      })

      query += ' ' + valuesString.join(',') + ';'

      await this.pool.query(query)
    } catch (error) {
      this.logger.error('Error inserting micro-payment:', error)
      throw error
    }
  }

  /*
    public async updateWithNewMicroPayment(
        outgoingPayment: OutgoingPayment,
        update: OutgoingPaymentWithNewMicroPaymentUpdate
    ): Promise<void> {
        const {state, sentAmount, microPayment} = update;
        const {id} = outgoingPayment;
        const client = await this.pool.connect();

        try {
            await client.query("BEGIN");

            const updateFields: string[] = ["sent_amount = $2"];
            const updateValues: any[] = [id, sentAmount];

            if (state !== undefined && state !== null) {
                updateFields.unshift("state = $3");
                updateValues.push(state);
            }

            const updateQuery = `UPDATE ${this.TABLE_NAME}
                                 SET ${updateFields.join(", ")}
                                 WHERE id = $1
            `;

            await client.query(updateQuery, updateValues);

            const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME}
                                     (id, outgoing_payment_id, method, ilp_peer_id, request_id, amount)
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
            await this.cache.set(this.CACHE_BY_ID_PREFIX + id, outgoingPayment);
        } catch (error) {
            await client.query("ROLLBACK");
            this.logger.error(
                "Error updating outgoing payment and inserting micro-payment:",
                error
            );
            throw error;
        } finally {
            client.release();
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
            this.logger.error("Error checking if outgoing payment exists:", error);
            throw error;
        }
    }

    public async store(outgoingPayment: OutgoingPayment): Promise<void> {
        try {
            const query = `
                INSERT INTO ${this.TABLE_NAME} (id, quote_id, asset_code, asset_scale, state, sent_amount, debit_amount,
                                                local_incoming_payment_id, remote_incoming_payment_url,
                                                sender_wallet_address_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `;

            const values = [
                outgoingPayment.id,
                outgoingPayment.quoteId,
                outgoingPayment.asset.code,
                outgoingPayment.asset.scale,
                outgoingPayment.state,
                outgoingPayment.sentAmount.toString(),
                outgoingPayment.debitAmount.toString(),
                outgoingPayment.localIncomingPaymentId,
                outgoingPayment.remoteIncomingPaymentUrl,
                outgoingPayment.senderWalletAddressId,
            ];

            await this.pool.query(query, values);
            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + outgoingPayment.id,
                outgoingPayment
            );
        } catch (error) {
            this.logger.error("Error storing outgoing payment:", error);
            throw error;
        }
    }

    public async fetchById(id: string): Promise<OutgoingPayment | undefined> {
        const cached = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
        if (cached) return cached;

        try {
            const res = await this.pool.query<IOutgoingPaymentRecord>(
                `SELECT id,
                        quote_id,
                        asset_code,
                        asset_scale,
                        state,
                        sent_amount,
                        debit_amount,
                        local_incoming_payment_id,
                        remote_incoming_payment_url,
                        sender_wallet_address_id
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
                [id]
            );

            if (res.rows.length === 0) return undefined;

            const row = res.rows[0];

            const outgoingPayment: OutgoingPayment = {
                id: row.id,
                quoteId: row.quote_id,
                asset: {
                    code: row.asset_code,
                    scale: row.asset_scale,
                },
                state: row.state as OutgoingPaymentState,
                sentAmount: BigInt(row.sent_amount),
                debitAmount: BigInt(row.debit_amount),
                localIncomingPaymentId: row.local_incoming_payment_id ?? undefined,
                remoteIncomingPaymentUrl: row.remote_incoming_payment_url ?? undefined,
                senderWalletAddressId: row.sender_wallet_address_id,
            };

            await this.cache.set(
                this.CACHE_BY_ID_PREFIX + outgoingPayment.id,
                outgoingPayment
            );
            return outgoingPayment;
        } catch (error) {
            this.logger.error("Error fetching outgoing payment by ID:", error);
            throw error;
        }
    }


    public async storeNewMicroPayment(
        outgoingPaymentId:string,
        microPayment:MicroPayment
    ): Promise<void>{
        const client = await this.pool.connect();

        try {
            const insertQuery = `INSERT INTO ${this.MICRO_PAYMENT_TABLE_NAME}
                                     (id, outgoing_payment_id, method, ilp_peer_id, request_id, amount)
                                 VALUES ($1, $2, $3, $4, $5, $6)
            `;

            const insertValues = [
                crypto.randomUUID(),
                outgoingPaymentId,
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



    public async fetchWithMicroPaymentsById(
        id: string
    ): Promise<OutgoingPaymentWithMicroPayments | undefined> {
        throw new Error("not implemented");
    }
    */
}

export class OutgoingPaymentInMemoryRepository
  implements IOutgoingPaymentRepository
{
  private map: Map<string, OutgoingPayment> = new Map()
  private microPaymentMap: Map<string, MicroPayment[]> = new Map()

  public async store(payment: OutgoingPayment): Promise<void> {
    this.map.set(payment.id, payment)
  }

  public async storeMany(payments: OutgoingPayment[]): Promise<void> {
    for (const item of payments) {
      this.map.set(item.id, item)
    }
  }

  public async fetchById(id: string): Promise<OutgoingPayment | undefined> {
    return this.map.get(id)
  }

  public async fetchByIds(ids: string[]): Promise<OutgoingPayment[]> {
    return Array.from(this.map.values()).filter((item) => ids.includes(item.id))
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id)
  }

  public async storeNewMicroPayment(
    outgoingPaymentId: string,
    microPayment: MicroPayment
  ): Promise<void> {
    const outgoingPaymentMicroPayments =
      this.microPaymentMap.get(outgoingPaymentId)

    if (!outgoingPaymentMicroPayments) {
      this.microPaymentMap.set(outgoingPaymentId, [microPayment])
    } else {
      outgoingPaymentMicroPayments.push(microPayment)
    }
  }

  public async storeManyNewMicroPayment(
    micropayments: { outgoingPaymentId: string; microPayment: MicroPayment }[]
  ): Promise<void> {
    for (const item of micropayments) {
      await this.storeNewMicroPayment(item.outgoingPaymentId, item.microPayment)
    }
  }

  public async updateWithNewMicroPayment(
    outgoingPayment: OutgoingPayment,
    update: OutgoingPaymentWithNewMicroPaymentUpdate
  ): Promise<void> {
    const { state, sentAmount, microPayment } = update
    const { id } = outgoingPayment
    const payment = this.map.get(id)
    if (!payment) {
      throw new Error(`Outgoing payment with id ${id} not found`)
    }

    if (state) {
      payment.state = state
    }
    payment.sentAmount = sentAmount

    await this.storeNewMicroPayment(id, microPayment)
  }

  public async delete(id: string): Promise<void> {
    if (this.map.has(id)) {
      this.map.delete(id)
    }
    if (this.microPaymentMap.has(id)) {
      this.microPaymentMap.delete(id)
    }
  }
}

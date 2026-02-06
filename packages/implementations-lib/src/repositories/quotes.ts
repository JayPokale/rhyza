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
  IQuoteRepository,
  OutgoingPayment,
  OutgoingPaymentState,
  Quote
} from 'payments-domain-lib'
import { ICache } from 'common-types-lib'

type QuoteRecord = {
  id: string
  receive_amount_value: string
  receive_amount_asset_code: string
  receive_amount_asset_scale: number
  debit_amount_value: string
  debit_amount_asset_code: string
  debit_amount_asset_scale: number
  sender_wallet_address_id: string
  incoming_payment_id: string
  expires_at: string
  exchange_rate: string
}

export class QuotePsqlRepository implements IQuoteRepository {
  private TABLE_NAME = 'quotes'
  private CACHE_BY_ID_PREFIX = 'quote_by_id:'

  constructor(
    private cache: ICache<Quote>,
    private pool: Pool,
    private logger: Logger
  ) {}

  public async storeMany(quotes: Quote[]): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      try {
        let query = `
                    INSERT INTO ${this.TABLE_NAME}
                    (id, receive_amount_value, receive_amount_asset_code,
                     receive_amount_asset_scale, debit_amount_value, debit_amount_asset_code,
                     debit_amount_asset_scale, sender_wallet_address_id, incoming_payment_id,
                     expires_at, exchange_rate)
                    VALUES
                `
        const valuesString: string[] = []
        quotes.forEach((item: Quote) => {
          valuesString.push(`('${item.id}', '${item.receiveAmount.value.toString()}',
                    '${item.receiveAmount.assetCode}', '${item.receiveAmount.assetScale}',
                    '${item.debitAmount.value.toString()}', '${item.debitAmount.assetCode}',
                    ${item.debitAmount.assetScale}, '${item.senderWalletAddressId}', '${item.incomingPaymentId}',
                    '${item.expiresAt.toISOString()}', '${item.exchangeRate.toString()}')`)
        })

        query += ' ' + valuesString.join(',')

        await this.pool.query(query)

        for (const item of quotes) {
          await this.cache.set(this.CACHE_BY_ID_PREFIX + item.id, item)
        }

        return resolve()
      } catch (error) {
        this.logger.error('Error storing incoming payment:', error)
        reject(error)
      }
    })
  }

  public async fetchByIds(ids: string[]): Promise<Quote[]> {
    const retList: Quote[] = []
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
      const query = `SELECT id,
                                  receive_amount_value,
                                  receive_amount_asset_code,
                                  receive_amount_asset_scale,
                                  debit_amount_value,
                                  debit_amount_asset_code,
                                  debit_amount_asset_scale,
                                  sender_wallet_address_id,
                                  incoming_payment_id,
                                  expires_at,
                                  exchange_rate FROM ${this.TABLE_NAME} WHERE id = ANY($1)`
      const res = await this.pool.query(query, [idsNotFoundInCache])

      if (res.rows.length > 0) {
        for (const dbObj of res.rows as QuoteRecord[]) {
          const obj: Quote = {
            id: dbObj.id,
            receiveAmount: {
              value: BigInt(dbObj.receive_amount_value),
              assetCode: dbObj.receive_amount_asset_code,
              assetScale: dbObj.receive_amount_asset_scale
            },
            debitAmount: {
              value: BigInt(dbObj.debit_amount_value),
              assetCode: dbObj.debit_amount_asset_code,
              assetScale: dbObj.debit_amount_asset_scale
            },
            senderWalletAddressId: dbObj.sender_wallet_address_id,
            incomingPaymentId: dbObj.incoming_payment_id,
            expiresAt: new Date(dbObj.expires_at),
            exchangeRate: Number(dbObj.exchange_rate)
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

  /*
    public async fetchById(id: string): Promise<Quote | undefined> {
        const cached = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
        if (cached) return cached;

        try {
            const res = await this.pool.query<QuoteRecord>(
                `SELECT id,
                        receive_amount_value,
                        receive_amount_asset_code,
                        receive_amount_asset_scale,
                        debit_amount_value,
                        debit_amount_asset_code,
                        debit_amount_asset_scale,
                        sender_wallet_address_id,
                        incoming_payment_id,
                        expires_at,
                        exchange_rate
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
                [id]
            );

            if (res.rows.length === 0) return undefined;

            const row = res.rows[0];

            const quote: Quote = {
                id: row.id,
                receiveAmount: {
                    value: BigInt(row.receive_amount_value),
                    assetCode: row.receive_amount_asset_code,
                    assetScale: row.receive_amount_asset_scale,
                },
                debitAmount: {
                    value: BigInt(row.debit_amount_value),
                    assetCode: row.debit_amount_asset_code,
                    assetScale: row.debit_amount_asset_scale,
                },
                senderWalletAddressId: row.sender_wallet_address_id,
                incomingPaymentId: row.incoming_payment_id,
                expiresAt: new Date(row.expires_at),
                exchangeRate: Number(row.exchange_rate),
            };

            await this.cache.set(this.CACHE_BY_ID_PREFIX + quote.id, quote);
            return quote;
        } catch (error) {
            this.logger.error("Error fetching quote by ID:", error);
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
            this.logger.error("Error checking if quote exists:", error);
            throw error;
        }
    }

    public async store(quote: Quote): Promise<void> {
        try {
            const query = `
                INSERT INTO ${this.TABLE_NAME} (id, receive_amount_value, receive_amount_asset_code,
                                                receive_amount_asset_scale, debit_amount_value, debit_amount_asset_code,
                                                debit_amount_asset_scale, sender_wallet_address_id, incoming_payment_id,
                                                expires_at, exchange_rate)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `;

            const values = [
                quote.id,
                quote.receiveAmount.value.toString(),
                quote.receiveAmount.assetCode,
                quote.receiveAmount.assetScale,
                quote.debitAmount.value.toString(),
                quote.debitAmount.assetCode,
                quote.debitAmount.assetScale,
                quote.senderWalletAddressId,
                quote.incomingPaymentId,
                quote.expiresAt.toISOString(),
                quote.exchangeRate.toString(),
            ];

            await this.pool.query(query, values);
            await this.cache.set(this.CACHE_BY_ID_PREFIX + quote.id, quote);
        } catch (error) {
            this.logger.error("Error storing quote:", error);
            throw error;
        }
    }

    public async updateAmounts(request: {
        id: string;
        amount: bigint;
    }): Promise<void> {
        const {id, amount} = request;
        try {
            const query = `
                UPDATE ${this.TABLE_NAME}
                SET receive_amount_value = $1,
                    debit_amount_value   = $2
                WHERE id = $3
            `;
            const values = [amount.toString(), amount.toString(), id];

            await this.pool.query(query, values);

            // Mutate the cached object, if it exists
            const cachedQuote = await this.cache.get(this.CACHE_BY_ID_PREFIX + id);
            if (cachedQuote) {
                cachedQuote.receiveAmount.value = amount;
                cachedQuote.debitAmount.value = amount;
                await this.cache.set(this.CACHE_BY_ID_PREFIX + id, cachedQuote);
            }
        } catch (error) {
            this.logger.error("Error updating quote amounts:", error);
            throw error;
        }
    }
    */
}

export class QuoteInMemoryRepository implements IQuoteRepository {
  private map: Map<string, Quote> = new Map()

  public async store(quote: Quote): Promise<void> {
    this.map.set(quote.id, quote)
  }

  public async storeMany(quotes: Quote[]): Promise<void> {
    for (const item of quotes) {
      this.map.set(item.id, item)
    }
  }

  public async fetchById(id: string): Promise<Quote | undefined> {
    return this.map.get(id)
  }

  public async fetchByIds(ids: string[]): Promise<Quote[]> {
    return Array.from(this.map.values()).filter((item) => ids.includes(item.id))
  }

  public async exists(id: string): Promise<boolean> {
    return this.map.has(id)
  }

  public async updateAmounts(request: {
    id: string
    amount: bigint
  }): Promise<void> {
    const { id, amount } = request
    const quote = this.map.get(id)
    if (!quote) {
      throw new Error(`Quote with id ${id} not found`)
    }

    quote.debitAmount.value = amount
    quote.receiveAmount.value = amount
  }

  public async delete(id: string): Promise<void> {
    if (this.map.has(id)) {
      this.map.delete(id)
    }
  }
}

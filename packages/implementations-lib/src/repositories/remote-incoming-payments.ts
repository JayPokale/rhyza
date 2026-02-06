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
  IRemoteIncomingPaymentRepository,
  RemoteIncomingPayment
} from 'payments-domain-lib'
import { ICache } from 'common-types-lib'

interface RemoteIncomingPaymentRecord {
  id: string
  expires_at: string
  asset_code: string
  asset_scale: number
  incoming_amount: string | null
  received_amount: string
  ilp_destination_address: string
  ilp_shared_secret: string
}

export class RemoteIncomingPaymentPsqlRepository
  implements IRemoteIncomingPaymentRepository
{
  private TABLE_NAME = 'remote_incoming_payments'
  private CACHE_BY_ID_PREFIX = 'remote_incoming_payments_by_id:'

  constructor(
    private cache: ICache<RemoteIncomingPayment>,
    private pool: Pool,
    private logger: Logger
  ) {}

  public async store(
    remoteIncomingPayment: RemoteIncomingPayment
  ): Promise<void> {
    try {
      const query = `
                INSERT INTO ${this.TABLE_NAME} (id, ilp_destination_address, ilp_shared_secret)
                VALUES ($1, $2, $3)
            `

      const values = [
        remoteIncomingPayment.id,
        remoteIncomingPayment.ilpDetails.destinationAddress,
        remoteIncomingPayment.ilpDetails.sharedSecret
      ]

      await this.pool.query(query, values)
      await this.cache.set(
        this.CACHE_BY_ID_PREFIX + remoteIncomingPayment.id,
        remoteIncomingPayment
      )
    } catch (error) {
      this.logger.error('Error storing remote incoming payment:', error)
      throw error
    }
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    const cached = await this.cache.get(id)
    if (cached) return cached

    try {
      const res = await this.pool.query<RemoteIncomingPaymentRecord>(
        `SELECT id, ilp_destination_address, ilp_shared_secret
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
        [id]
      )

      if (res.rows.length === 0) return undefined

      const row = res.rows[0]

      const remoteIncomingPayment: RemoteIncomingPayment = {
        id: row.id,
        type: 'REMOTE',
        ilpDetails: {
          destinationAddress: row.ilp_destination_address,
          sharedSecret: row.ilp_shared_secret
        }
      }

      await this.cache.set(
        this.CACHE_BY_ID_PREFIX + remoteIncomingPayment.id,
        remoteIncomingPayment
      )
      return remoteIncomingPayment
    } catch (error) {
      this.logger.error('Error fetching remote incoming payment by ID:', error)
      throw error
    }
  }
}

export class RemoteIncomingPaymentInMemoryRepository
  implements IRemoteIncomingPaymentRepository
{
  private map: Map<string, RemoteIncomingPayment> = new Map()

  public async store(payment: RemoteIncomingPayment): Promise<void> {
    this.map.set(payment.id, payment)
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    return this.map.get(id)
  }
}

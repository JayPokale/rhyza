/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

import { Pool } from 'pg'
import { IPeerAccountRepository } from '../domain/interfaces'
import { PeerAccount } from '../domain/types'
import { ILogger } from 'common-types-lib'

type PeerAccountRecord = {
  id: string
  asset_code: string
  asset_scale: number
  liquidity_account_id: string
}

const TABLE_NAME = 'peer_accounts'

export class PeerAccountPsqlRepository implements IPeerAccountRepository {
  private _pool: Pool
  private _logger: ILogger
  private _cache: Map<string, PeerAccount> = new Map()

  constructor(pool: Pool, logger: ILogger) {
    this._pool = pool
    this._logger = logger
  }

  public async exists(id: string): Promise<boolean> {
    if (this._cache.has(id)) {
      return true
    }

    try {
      const res = await this._pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${TABLE_NAME} WHERE id = $1)`,
        [id]
      )
      return res.rows[0].exists
    } catch (error) {
      this._logger.error({ error }, 'Error checking if peer account exists')
      throw error
    }
  }

  public async store(peerAccount: PeerAccount): Promise<void> {
    try {
      const query = `
                INSERT INTO ${TABLE_NAME}
                    (id, asset_code, asset_scale, liquidity_account_id)
                VALUES ($1, $2, $3, $4)
            `
      const values = [
        peerAccount.id,
        peerAccount.assetCode,
        peerAccount.assetScale,
        peerAccount.liquidityAccountId
      ]

      await this._pool.query(query, values)
      this._cache.set(peerAccount.id, peerAccount)
    } catch (error) {
      this._logger.error({ error }, 'Error storing peer account')
      throw error
    }
  }

  public async fetchById(id: string): Promise<PeerAccount | undefined> {
    const cached = this._cache.get(id)

    if (cached) {
      return cached
    }

    const res = await this._pool.query<PeerAccountRecord>(
      `SELECT id, asset_code, asset_scale, liquidity_account_id
             FROM ${TABLE_NAME}
             WHERE id = $1`,
      [id]
    )

    if (res.rows.length === 0) return undefined

    const row = res.rows[0]

    const peerAccount = {
      id: row.id,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
      liquidityAccountId: row.liquidity_account_id
    }

    this._cache.set(id, peerAccount)

    return peerAccount
  }
}

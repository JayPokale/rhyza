'use strict'

import { Pool } from 'pg'
import { ILogger } from 'common-types-lib'
import { AssetAccount } from '../domain/types'
import { IAssetAccountRepository } from '../domain/interfaces'

interface AssetAccountRecord {
  id: string
  asset_code: string
  asset_scale: number
  liquidity_account_id: string
  settlement_account_id: string
}

const TABLE_NAME = 'asset_accounts'

export class AssetAccountPsqlRepository implements IAssetAccountRepository {
  private _pool: Pool
  private _logger: ILogger
  private _cache: Map<string, AssetAccount> = new Map() // code, AssetAccount

  constructor(pool: Pool, logger: ILogger) {
    this._pool = pool
    this._logger = logger
  }

  async init() {}

  public async existsByCode(code: string): Promise<boolean> {
    if (this._cache.has(code)) {
      return true
    }

    try {
      const res = await this._pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${TABLE_NAME} WHERE asset_code = $1)`,
        [code]
      )
      return res.rows[0].exists
    } catch (error) {
      this._logger.error({ error }, 'Error checking if asset account exists')
      throw error
    }
  }

  public async store(assetAccount: AssetAccount): Promise<void> {
    try {
      const query = `
                INSERT INTO ${TABLE_NAME}
                (id, asset_code, asset_scale, liquidity_account_id, settlement_account_id)
                VALUES ($1, $2, $3, $4, $5)
            `
      const values = [
        assetAccount.id,
        assetAccount.assetCode,
        assetAccount.assetScale,
        assetAccount.liquidityAccountId,
        assetAccount.settlementAccountId
      ]

      await this._pool.query(query, values)
      this._cache.set(assetAccount.assetCode, assetAccount)
    } catch (error) {
      this._logger.error({ error }, 'Error storing asset account')
      throw error
    }
  }

  public async fetchByCode(code: string): Promise<AssetAccount | undefined> {
    const cached = this._cache.get(code)
    if (cached) {
      return cached
    }

    const res = await this._pool.query<AssetAccountRecord>(
      `SELECT id, asset_code, asset_scale, liquidity_account_id, settlement_account_id
             FROM ${TABLE_NAME}
             WHERE asset_code = $1`,
      [code]
    )

    if (res.rows.length === 0) return undefined

    const row = res.rows[0]

    const assetAccount = {
      id: row.id,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
      liquidityAccountId: row.liquidity_account_id,
      settlementAccountId: row.settlement_account_id
    }

    this._cache.set(code, assetAccount)

    return assetAccount
  }
}

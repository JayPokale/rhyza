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
import { Asset } from 'common-types-lib'
import {} from 'payments-domain-lib'
import { IAssetRepository } from 'payments-domain-lib'

export class AssetPsqlRepository implements IAssetRepository {
  TABLE_NAME = 'assets'

  constructor(
    private pool: Pool,
    private logger: Logger
  ) {}

  public async existsByCode(code: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE code = $1)`,
        [code]
      )
      return res.rows[0].exists
    } catch (error) {
      this.logger.error({ error }, 'Error checking if asset exists')
      throw error
    }
  }

  public async store(id: string, scale: number, code: string): Promise<void> {
    try {
      const query = `
                INSERT INTO ${this.TABLE_NAME} (id, code, scale)
                VALUES ($1, $2, $3)
            `

      const values = [id, code, scale]

      await this.pool.query(query, values)
    } catch (error) {
      this.logger.error({ error }, 'Error storing asset')
      throw error
    }
  }
}

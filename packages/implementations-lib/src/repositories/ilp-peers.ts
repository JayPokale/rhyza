/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

import { IIlpPeerRepository, IlpPeer } from 'payments-domain-lib'
import type { Pool } from 'pg'
import type { Logger } from 'pino'
import { ICache } from 'common-types-lib'

interface IlpPeerRecord {
  id: string
  asset_code: string
  asset_scale: number
  address: string
  connector_url: string
  callback_url: string
}

export class IlpPeerPsqlRepository implements IIlpPeerRepository {
  private TABLE_NAME = 'ilp_peers'
  private CACHE_BY_ID_PREFIX = 'ilp_peer_by_id:'
  private CACHE_ID_BY_ADDRESS_PREFIX = 'ilp_peer_id_by_address:'

  constructor(
    private cache: ICache<IlpPeer>,
    private idCache: ICache<string>,
    private pool: Pool,
    private logger: Logger
  ) {}

  public async store(ilpPeer: IlpPeer): Promise<void> {
    try {
      const query = `
                INSERT INTO ${this.TABLE_NAME} (id, asset_code, asset_scale, address, connector_url, callback_url)
                VALUES ($1, $2, $3, $4, $5, $6)
            `
      const values = [
        ilpPeer.id,
        ilpPeer.asset.code,
        ilpPeer.asset.scale,
        ilpPeer.address,
        ilpPeer.connectorUrl,
        ilpPeer.callbackUrl
      ]

      await this.pool.query(query, values)
      await this.cache.set(this.CACHE_BY_ID_PREFIX + ilpPeer.id, ilpPeer)
      await this.idCache.set(
        this.CACHE_ID_BY_ADDRESS_PREFIX + ilpPeer.address,
        ilpPeer.id
      )
    } catch (error) {
      this.logger.error('Error storing ILP Peer:', error)
      throw error
    }
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    const cached = await this.cache.get(this.CACHE_BY_ID_PREFIX + id)
    if (cached) return cached

    try {
      const res = await this.pool.query<IlpPeerRecord>(
        `SELECT id, asset_code, asset_scale, address, connector_url, callback_url
                 FROM ${this.TABLE_NAME}
                 WHERE id = $1`,
        [id]
      )

      if (res.rows.length === 0) return undefined

      const row = res.rows[0]
      const ilpPeer: IlpPeer = {
        id: row.id,
        asset: {
          code: row.asset_code,
          scale: row.asset_scale
        },
        address: row.address,
        connectorUrl: row.connector_url,
        callbackUrl: row.callback_url
      }

      await this.cache.set(this.CACHE_BY_ID_PREFIX + ilpPeer.id, ilpPeer)
      return ilpPeer
    } catch (error) {
      this.logger.error('Error fetching ILP Peer by ID:', error)
      throw error
    }
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    const cachedId = await this.idCache.get(
      this.CACHE_ID_BY_ADDRESS_PREFIX + address
    )
    if (cachedId) {
      const cached = await this.cache.get(this.CACHE_BY_ID_PREFIX + cachedId)
      if (cached) {
        return cached
      }
    }

    try {
      const res = await this.pool.query<IlpPeerRecord>(
        `SELECT id, asset_code, asset_scale, address, connector_url, callback_url
                 FROM ${this.TABLE_NAME}
                 WHERE address = $1`,
        [address]
      )

      if (res.rows.length === 0) return undefined

      const row = res.rows[0]
      const ilpPeer: IlpPeer = {
        id: row.id,
        asset: {
          code: row.asset_code,
          scale: row.asset_scale
        },
        address: row.address,
        connectorUrl: row.connector_url,
        callbackUrl: row.callback_url
      }

      await this.cache.set(this.CACHE_BY_ID_PREFIX + ilpPeer.id, ilpPeer)
      await this.idCache.set(
        this.CACHE_ID_BY_ADDRESS_PREFIX + ilpPeer.address,
        ilpPeer.id
      )
      return ilpPeer
    } catch (error) {
      this.logger.error(
        'Error fetching ILP Peer by destination address:',
        error
      )
      throw error
    }
  }
}

export class IlpPeerInMemoryRepository implements IIlpPeerRepository {
  map: Map<string, IlpPeer> = new Map()

  public async store(entity: IlpPeer): Promise<void> {
    this.map.set(entity.id, entity)
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    return this.map.get(id)
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return [...this.map.values()].find((peer) => peer.address === address)
  }
}

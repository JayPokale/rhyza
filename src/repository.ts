import type { Pool } from "pg";
import { WalletAddress } from "./wallet-address";

interface BaseEntity {
  id: string;
}

export interface Repository<T extends BaseEntity> {
  store(entity: T): Promise<void>;
  fetchById(id: string): Promise<T | undefined>;
}

export class InMemoryRepository<T extends BaseEntity> implements Repository<T> {
  map: Map<string, T> = new Map();

  public async store(entity: T): Promise<void> {
    this.map.set(entity.id, entity);
  }

  public async fetchById(id: string): Promise<T | undefined> {
    return this.map.get(id);
  }
}
// TODO: Consider abstracting postgres queries into generic interface that can be implemented by different databases.
// Idea being to make adding or switching between databases easier. Would not need a new repo, just pass in a new
// database implementation.
// - Unsure if differences between databases (SQL joins vs. embedded documents for example) would make this abstraction
//   more complicated than it's worth.
// - Current implementation would require new repo for each resources and database.
//   WalletAddressPSQLRepository, WalletAddressMongoDBRepository etc.

// TODO: is this necessary? ATM just sets the query return type.
// We dont do anything with the record other than map it to a domain object.
interface WalletAddressRecord {
  id: string;
  url: string;
  is_active: boolean;
  asset_code: string;
  asset_scale: number;
}

export class WalletAddressPSQLRepository implements Repository<WalletAddress> {
  TABLE_NAME = "wallet_addresses";
  constructor(private pool: Pool) {}

  // TODO: include any sort of created_at? updated_at? Perhaps outside the scope of POC.
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
    } catch (error) {
      console.error("Error storing wallet address:", error);
      throw error;
    }
  }

  public async fetchById(id: string): Promise<WalletAddress | undefined> {
    const res = await this.pool.query<WalletAddressRecord>(
      `SELECT id, url, is_active, asset_code, asset_scale FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      url: row.url,
      isActive: row.is_active,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
    };
  }
}

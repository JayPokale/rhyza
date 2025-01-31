import { Pool } from "pg";
import { Repository } from "./repository";

export class DuplicateWalletAddressFoundError extends Error {}
// export class InvalidWalletAddressURLError extends Error {}

export interface WalletAddress {
  id: string;
  url: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

interface CreateWalletAddressArgs {
  id?: string;
  url: string;
  assetCode: string;
  assetScale: number;
}

export interface WalletAddressServiceAdapter {
  getById(id: string): Promise<WalletAddress | undefined>;
  createWalletAddress(args: CreateWalletAddressArgs): Promise<string>;
}

export class WalletAddressService implements WalletAddressServiceAdapter {
  constructor(private walletAddressRepository: Repository<WalletAddress>) {}

  public async createWalletAddress(
    args: CreateWalletAddressArgs
  ): Promise<string> {
    let id: string;

    if (args.id) {
      const existingIncomingPayment =
        await this.walletAddressRepository.fetchById(args.id);

      if (existingIncomingPayment) {
        throw new DuplicateWalletAddressFoundError();
      }
      id = args.id;
    } else {
      id = crypto.randomUUID();
    }

    // TODO: throw this error?
    // if (args.url.length === 0) {
    //   throw new InvalidWalletAddressURLError();
    // }

    const walletAddress: WalletAddress = {
      ...args,
      isActive: true,
      id,
    };

    await this.walletAddressRepository.store(walletAddress);

    return id;
  }

  public getById(id: string): Promise<WalletAddress | undefined> {
    return this.walletAddressRepository.fetchById(id);
  }
}

interface WalletAddressRecord {
  id: string;
  url: string;
  is_active: boolean;
  asset_code: string;
  asset_scale: number;
}

export class WalletAddressPsqlRepository implements Repository<WalletAddress> {
  TABLE_NAME = "wallet_addresses";
  constructor(private pool: Pool) {}

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

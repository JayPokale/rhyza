import { Pool } from "pg";
import logger from "./logger";
import { AccountFlags, Client as TigerBeetleClient } from "tigerbeetle-node";

export enum LedgerAccountType {
  LIQUIDITY_ASSET = "LIQUIDITY_ASSET",
  LIQUIDITY_PEER = "LIQUIDITY_PEER",
  LIQUIDITY_WALLET_ADDRESS = "LIQUIDITY_WALLET_ADDRESS",
  SETTLEMENT = "SETTLEMENT",
}

export interface LedgerAccount {
  id: string;
  assetCode: string;
  type: LedgerAccountType;
  externalRef: string;
  readonly creditsPosted: bigint;
  readonly debitsPosted: bigint;
}

export interface LedgerTransfer {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
  assetCode: string;
}

export interface LedgerAccountRepository {
  store(accounts: LedgerAccount[]): Promise<void>;
}

export interface LedgerTransferRepository {
  create(transfers: LedgerTransfer[]): Promise<void>;
}

interface AssetAccount {
  id: string;
  assetCode: string;
  assetScale: number;
  settlementAccountId: string;
  liquidityAccountId: string;
  // lowLiquidityThreshold?: bigint;
  // highLiquidityThreshold?: bigint;
}

interface PeerAccount {
  id: string;
  assetCode: string;
  assetScale: number;
  liquidityAccountId: string;
  // lowLiquidityThreshold?: bigint;
  // highLiquidityThreshold?: bigint;
}

interface WalletAddressAccount {
  id: string;
  assetCode: string;
  assetScale: number;
  liquidityAccountId: string;
}

export interface AssetAccountRepository {
  store(entity: AssetAccount): Promise<void>;
  existsByCode(id: string): Promise<boolean>;
  fetchByCode(code: string): Promise<AssetAccount | undefined>;
}

interface AssetAccountRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  liquidity_account_id: string;
  settlement_account_id: string;
}

export class AssetAccountPsqlRepository implements AssetAccountRepository {
  TABLE_NAME = "asset_accounts";
  map: Map<string, AssetAccount> = new Map(); // code, AssetAccount

  constructor(private pool: Pool) {}

  public async existsByCode(code: string): Promise<boolean> {
    if (this.map.has(code)) {
      return true;
    }

    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE asset_code = $1)`,
        [code]
      );
      return res.rows[0].exists;
    } catch (error) {
      logger.error({ error }, "Error checking if asset account exists");
      throw error;
    }
  }

  public async store(assetAccount: AssetAccount): Promise<void> {
    try {
      const query = `
          INSERT INTO ${this.TABLE_NAME} 
          (id, asset_code, asset_scale, liquidity_account_id, settlement_account_id)
          VALUES ($1, $2, $3, $4, $5)
        `;
      const values = [
        assetAccount.id,
        assetAccount.assetCode,
        assetAccount.assetScale,
        assetAccount.liquidityAccountId,
        assetAccount.settlementAccountId,
      ];

      await this.pool.query(query, values);
      this.map.set(assetAccount.assetCode, assetAccount);
    } catch (error) {
      logger.error({ error }, "Error storing asset account");
      throw error;
    }
  }

  public async fetchByCode(code: string): Promise<AssetAccount | undefined> {
    const cached = this.map.get(code);
    if (cached) {
      return cached;
    }

    const res = await this.pool.query<AssetAccountRecord>(
      `SELECT id, asset_code, asset_scale, liquidity_account_id, settlement_account_id FROM ${this.TABLE_NAME} WHERE asset_code = $1`,
      [code]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
      liquidityAccountId: row.liquidity_account_id,
      settlementAccountId: row.settlement_account_id,
    };
  }
}

export interface PeerAccountRepository {
  store(entity: PeerAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchById(id: string): Promise<PeerAccount | undefined>;
}

interface PeerAccountRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  liquidity_account_id: string;
}

export class PeerAccountPsqlRepository implements PeerAccountRepository {
  TABLE_NAME = "peer_accounts";
  map: Map<string, PeerAccount> = new Map();

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    if (this.map.has(id)) {
      return true;
    }

    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      logger.error({ error }, "Error checking if peer account exists");
      throw error;
    }
  }

  public async store(peerAccount: PeerAccount): Promise<void> {
    try {
      const query = `
          INSERT INTO ${this.TABLE_NAME} 
          (id, asset_code, asset_scale, liquidity_account_id)
          VALUES ($1, $2, $3, $4)
        `;
      const values = [
        peerAccount.id,
        peerAccount.assetCode,
        peerAccount.assetScale,
        peerAccount.liquidityAccountId,
      ];

      await this.pool.query(query, values);
      this.map.set(peerAccount.id, peerAccount);
    } catch (error) {
      logger.error({ error }, "Error storing peer account");
      throw error;
    }
  }

  public async fetchById(id: string): Promise<PeerAccount | undefined> {
    const cached = this.map.get(id);

    if (cached) {
      return cached;
    }

    const res = await this.pool.query<PeerAccountRecord>(
      `SELECT id, asset_code, asset_scale, liquidity_account_id FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
      liquidityAccountId: row.liquidity_account_id,
    };
  }
}

export interface WalletAddressAccountRepository {
  store(entity: WalletAddressAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchById(id: string): Promise<WalletAddressAccount | undefined>;
}

interface WalletAddressAccountRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  liquidity_account_id: string;
}

export class WalletAddressAccountPsqlRepository
  implements WalletAddressAccountRepository
{
  TABLE_NAME = "wallet_address_accounts";
  map: Map<string, WalletAddressAccount> = new Map();

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    if (this.map.has(id)) {
      return true;
    }

    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
      );
      return res.rows[0].exists;
    } catch (error) {
      logger.error(
        { error },
        "Error checking if wallet address account exists"
      );
      throw error;
    }
  }

  public async store(
    walletAddressAccount: WalletAddressAccount
  ): Promise<void> {
    try {
      const query = `
          INSERT INTO ${this.TABLE_NAME} 
          (id, asset_code, asset_scale, liquidity_account_id)
          VALUES ($1, $2, $3, $4)
        `;
      const values = [
        walletAddressAccount.id,
        walletAddressAccount.assetCode,
        walletAddressAccount.assetScale,
        walletAddressAccount.liquidityAccountId,
      ];

      await this.pool.query(query, values);
      this.map.set(walletAddressAccount.id, walletAddressAccount);
    } catch (error) {
      logger.error({ error }, "Error storing wallet address account");
      throw error;
    }
  }

  public async fetchById(
    id: string
  ): Promise<WalletAddressAccount | undefined> {
    const cached = this.map.get(id);

    if (cached) {
      return cached;
    }

    const res = await this.pool.query<WalletAddressAccountRecord>(
      `SELECT id, asset_code, asset_scale, liquidity_account_id FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      assetCode: row.asset_code,
      assetScale: row.asset_scale,
      liquidityAccountId: row.liquidity_account_id,
    };
  }
}

export enum TigerBeetleAccountCode {
  LIQUIDITY_ASSET = 1,
  LIQUIDITY_PEER = 2,
  LIQUIDITY_WALLET_ADDRESS = 3,
  SETTLEMENT = 101,
}

export const convertToTigerBeetleAccountType: {
  [key in LedgerAccountType]: TigerBeetleAccountCode;
} = {
  [LedgerAccountType.LIQUIDITY_WALLET_ADDRESS]:
    TigerBeetleAccountCode.LIQUIDITY_WALLET_ADDRESS,
  [LedgerAccountType.LIQUIDITY_ASSET]: TigerBeetleAccountCode.LIQUIDITY_ASSET,
  [LedgerAccountType.LIQUIDITY_PEER]: TigerBeetleAccountCode.LIQUIDITY_PEER,
  [LedgerAccountType.SETTLEMENT]: TigerBeetleAccountCode.SETTLEMENT,
};

export const convertFromTigerBeetleAccountType: {
  [key in TigerBeetleAccountCode]: LedgerAccountType;
} = {
  [TigerBeetleAccountCode.LIQUIDITY_WALLET_ADDRESS]:
    LedgerAccountType.LIQUIDITY_WALLET_ADDRESS,
  [TigerBeetleAccountCode.LIQUIDITY_ASSET]: LedgerAccountType.LIQUIDITY_ASSET,
  [TigerBeetleAccountCode.LIQUIDITY_PEER]: LedgerAccountType.LIQUIDITY_PEER,
  [TigerBeetleAccountCode.SETTLEMENT]: LedgerAccountType.SETTLEMENT,
};

function assetCodeToUInt32(assetCode: string): number {
  const byte1 = assetCode.charCodeAt(0) << 16;
  const byte2 = assetCode.charCodeAt(1) << 8;
  const byte3 = assetCode.charCodeAt(2);

  return byte1 | byte2 | byte3;
}

function uint32ToAssetCode(value: number): string {
  const byte1 = (value >> 16) & 0xff;
  const byte2 = (value >> 8) & 0xff;
  const byte3 = value & 0xff;

  return (
    String.fromCharCode(byte1) +
    String.fromCharCode(byte2) +
    String.fromCharCode(byte3)
  );
}

function toTbId(uuid: string): bigint {
  return BigInt(`0x${uuid.replace(/-/g, "")}`);
}

function fromTbIdToUuid(id: bigint): string {
  const hexString = id.toString(16).padStart(32, "0");

  return `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(
    12,
    16
  )}-${hexString.slice(16, 20)}-${hexString.slice(20)}`;
}

function toTbAccountFlags(account: LedgerAccount): AccountFlags {
  const flags =
    account.type === LedgerAccountType.SETTLEMENT
      ? AccountFlags.credits_must_not_exceed_debits
      : AccountFlags.debits_must_not_exceed_credits;

  return flags;
}

export class TBLedgerAccountRepository implements LedgerAccountRepository {
  constructor(private client: TigerBeetleClient) {}

  public async fetchById(id: string): Promise<LedgerAccount | undefined> {
    const accounts = await this.client.lookupAccounts([toTbId(id)]);

    if (!accounts.length) {
      return undefined;
    }

    const acc = accounts[0];

    return {
      id,
      type: convertFromTigerBeetleAccountType[
        acc.code as TigerBeetleAccountCode
      ],
      assetCode: uint32ToAssetCode(acc.ledger),
      creditsPosted: acc.credits_posted,
      debitsPosted: acc.debits_posted,
      externalRef: fromTbIdToUuid(acc.user_data_128),
    };
  }

  public async store(accounts: LedgerAccount[]): Promise<void> {
    await this.client.createAccounts(
      accounts.map((account) => ({
        id: toTbId(account.id),
        code: convertToTigerBeetleAccountType[account.type],
        ledger: assetCodeToUInt32(account.assetCode),
        user_data_32: 0,
        user_data_64: 0n,
        user_data_128: toTbId(account.externalRef),
        reserved: 0,
        flags: toTbAccountFlags(account),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        timestamp: 0n,
      }))
    );
  }
}

export class TBLedgerTransferRepository implements LedgerTransferRepository {
  constructor(private client: TigerBeetleClient) {}

  public async create(transfers: LedgerTransfer[]): Promise<void> {
    await this.client.createTransfers(
      transfers.map((transfer) => ({
        id: toTbId(transfer.id),
        code: 1,
        ledger: assetCodeToUInt32(transfer.assetCode),
        debit_account_id: toTbId(transfer.debitAccountId),
        credit_account_id: toTbId(transfer.creditAccountId),
        user_data_32: 0,
        user_data_64: 0n,
        user_data_128: 0n,
        reserved: 0,
        flags: 0,
        timestamp: 0n,
        amount: transfer.amount,
        pending_id: 0n,
        timeout: 0,
      }))
    );
  }
}

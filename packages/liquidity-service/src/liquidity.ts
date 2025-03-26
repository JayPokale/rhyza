import { Pool } from "pg";
import logger from "./logger";
import { Amount, Asset, IlpPeer, WalletAddress } from "./shared";
import { Client as TigerBeetleClient } from "tigerbeetle-node";

/**
 * ACCOUNT MOVEMENTS
 *
 * When adding liquidity to asset:
 * - settlement => asset
 *
 * When withdrawing liquidity from asset:
 * - asset => settlement
 *
 * When adding liquidity to peer:
 * - settlement => peer
 *
 * When withdrawing liquidity from peer:
 * - peer => settlement
 *
 * When funding a payment:
 * - settlement => wallet address
 *
 * When withdrawing from a payment:
 * - wallet address => settlement
 *
 * When making local payment:
 * - wallet address => wallet address
 * - FX: wallet address => asset liquidity A & asset liquidity B => wallet addres
 *
 * When sending remote (ILP) payments:
 * - wallet address => peer
 * - FX: wallet address => asset liqudity A & asset liquidity B => peer
 *
 * When receiving remote (ILP) payments:
 * - peer => wallet address
 * - FX: peer => asset liquidity A & asset liquidity B => wallet address
 */

class DuplicateAssetAccountFoundError extends Error {}
class DuplicatePeerAccountFoundError extends Error {}
class AccountNotFoundError extends Error {}
class AssetScaleTooHighError extends Error {}

export enum LiquidityRequestType {
  DEPOSIT_ASSET = "DEPOSIT_ASSET",
  WITHDRAW_ASSET = "WITHDRAW_ASSET",
  DEPOSIT_PEER = "DEPOSIT_PEER",
  WITHDRAW_PEER = "WITHDRAW_PEER",
  DEPOSIT_WALLET_ADDRESS = "DEPOSIT_WALLET_ADDRESS",
  WITHDRAW_WALLET_ADDRESS = "WITHDRAW_WALLET_ADDRESS",
  WALLET_ADDRESS_TO_WALLET_ADDRESS = "WALLET_ADDRESS_TO_WALLET_ADDRESS",
  PEER_TO_WALLET_ADDRESS = "PEER_TO_WALLET_ADDRESS",
  WALLET_ADDRESS_TO_PEER = "WALLET_ADDRESS_TO_PEER",
}

export interface LiquidityRequestBase {
  id: string;
  type: LiquidityRequestType;
  data: Record<string, unknown>;
}

export type LiquidityRequest =
  | WalletToWalletAddressLiquidityRequest
  | WalletAddressDepositLiquidityRequest
  | WalletAddressToPeerLiquidityRequest
  | PeerToWalletAddressLiquidityRequest;

export interface WalletToWalletAddressLiquidityRequest
  extends LiquidityRequestBase {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS;
  data: {
    walletAddressIdToDebit: string;
    walletAddressIdToCredit: string;
    amount: Amount;
  };
}

export interface WalletAddressDepositLiquidityRequest
  extends LiquidityRequestBase {
  type: LiquidityRequestType.DEPOSIT_WALLET_ADDRESS;
  data: {
    walletAddressId: string;
    amount: Amount;
  };
}

export interface WalletAddressToPeerLiquidityRequest
  extends LiquidityRequestBase {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_PEER;
  data: {
    peerId: string;
    walletAddressId: string;
    amount: Amount;
  };
}

export interface PeerToWalletAddressLiquidityRequest
  extends LiquidityRequestBase {
  type: LiquidityRequestType.PEER_TO_WALLET_ADDRESS;
  data: {
    peerId: string;
    walletAddressId: string;
    amount: Amount;
  };
}

enum LedgerAccountType {
  LIQUIDITY_ASSET = "LIQUIDITY_ASSET",
  LIQUIDITY_PEER = "LIQUIDITY_PEER",
  LIQUIDITY_WALLET_ADDRESS = "LIQUIDITY_WALLET_ADDRESS",
  SETTLEMENT = "SETTLEMENT",
}

interface LedgerAccount {
  id: string;
  assetCode: string;
  type: LedgerAccountType;
  externalRef: string;
  readonly creditsPosted: bigint;
  readonly debitsPosted: bigint;
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

interface LedgerTransfer {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: bigint;
  assetCode: string;
}

interface AssetAccountRepository {
  store(entity: AssetAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchByCode(code: string): Promise<AssetAccount | undefined>;
}

interface PeerAccountRepository {
  store(entity: PeerAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchById(id: string): Promise<PeerAccount | undefined>;
}

interface WalletAddressAccountRepository {
  store(entity: WalletAddressAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchById(id: string): Promise<WalletAddressAccount | undefined>;
}

interface LedgerAccountRepository {
  store(accounts: LedgerAccount[]): Promise<void>;
}

interface LedgerTransferRepository {
  create(transfers: LedgerTransfer[]): Promise<void>;
}

export interface LiquidityServiceAdapter {
  execute(requests: LiquidityRequest[]): Promise<void>;
  createWalletAddressAccount(walletAddress: WalletAddress): Promise<void>;
  createAssetAccount(asset: Asset): Promise<void>;
  createIlpPeerAccount(ilpPeer: IlpPeer): Promise<void>;
}

export class LiquidityService implements LiquidityServiceAdapter {
  LEDGER_SCALE_MAGIC_NUMBER = 20n;

  constructor(
    private assetAccountRepository: AssetAccountRepository,
    private peerAccountRepository: PeerAccountRepository,
    private walletAddressAccountRepository: WalletAddressAccountRepository,
    private ledgerTransferRepository: LedgerTransferRepository,
    private ledgerAccountRepository: LedgerAccountRepository
  ) {}

  public async execute(requests: LiquidityRequest[]): Promise<void> {
    const transfersToCreate: LedgerTransfer[] = [];

    for (const request of requests) {
      if (request.type === LiquidityRequestType.DEPOSIT_WALLET_ADDRESS) {
        transfersToCreate.push(
          await this.prepareWalletAddressDepositTransfer(request)
        );
      }

      if (
        request.type === LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS
      ) {
        transfersToCreate.push(
          await this.prepareWalletToWalletAddressTransfer(request)
        );
      }
    }

    await this.ledgerTransferRepository.create(transfersToCreate);
  }

  private async prepareWalletAddressDepositTransfer(
    request: WalletAddressDepositLiquidityRequest
  ): Promise<LedgerTransfer> {
    const [settlementAccount, walletAddressAccount] = await Promise.all([
      this.assetAccountRepository.fetchByCode(request.data.amount.assetCode),
      this.walletAddressAccountRepository.fetchById(
        request.data.walletAddressId
      ),
    ]);

    if (!settlementAccount || !walletAddressAccount) {
      throw new AccountNotFoundError();
    }

    return {
      id: request.id,
      debitAccountId: settlementAccount.settlementAccountId,
      creditAccountId: walletAddressAccount.liquidityAccountId,
      assetCode: request.data.amount.assetCode,
      amount:
        request.data.amount.value *
        10n **
          (this.LEDGER_SCALE_MAGIC_NUMBER -
            BigInt(request.data.amount.assetScale)),
    };
  }

  private async prepareWalletToWalletAddressTransfer(
    request: WalletToWalletAddressLiquidityRequest
  ): Promise<LedgerTransfer> {
    const [walletAddressToDebit, walletAddressToCredit] = await Promise.all([
      this.walletAddressAccountRepository.fetchById(
        request.data.walletAddressIdToDebit
      ),
      this.walletAddressAccountRepository.fetchById(
        request.data.walletAddressIdToCredit
      ),
    ]);

    if (!walletAddressToDebit || !walletAddressToCredit) {
      throw new AccountNotFoundError();
    }

    return {
      id: request.id,
      debitAccountId: walletAddressToDebit.liquidityAccountId,
      creditAccountId: walletAddressToCredit.liquidityAccountId,
      assetCode: request.data.amount.assetCode,
      amount:
        request.data.amount.value *
        10n **
          (this.LEDGER_SCALE_MAGIC_NUMBER -
            BigInt(request.data.amount.assetScale)),
    };
  }

  public async createAssetAccount(asset: Asset): Promise<void> {
    if (await this.assetAccountRepository.exists(asset.id)) {
      throw new DuplicateAssetAccountFoundError();
    }

    // This should go into the asset service
    if (asset.scale > this.LEDGER_SCALE_MAGIC_NUMBER) {
      throw new AssetScaleTooHighError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: asset.id,
      assetCode: asset.code,
      type: LedgerAccountType.LIQUIDITY_ASSET,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    const settlementAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: asset.id,
      assetCode: asset.code,
      type: LedgerAccountType.SETTLEMENT,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([
      liquidityAccount,
      settlementAccount,
    ]);

    await this.assetAccountRepository.store({
      id: asset.id,
      assetCode: asset.code,
      assetScale: asset.scale,
      settlementAccountId: settlementAccount.id,
      liquidityAccountId: liquidityAccount.id,
    });
  }

  public async createIlpPeerAccount(peer: IlpPeer): Promise<void> {
    if (await this.peerAccountRepository.exists(peer.id)) {
      throw new DuplicatePeerAccountFoundError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      assetCode: peer.assetCode,
      externalRef: peer.id,
      type: LedgerAccountType.LIQUIDITY_PEER,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([liquidityAccount]);

    await this.peerAccountRepository.store({
      id: peer.id,
      assetCode: peer.assetCode,
      assetScale: peer.assetScale,
      liquidityAccountId: liquidityAccount.id,
    });
  }

  public async createWalletAddressAccount(
    walletAddress: WalletAddress
  ): Promise<void> {
    if (await this.walletAddressAccountRepository.exists(walletAddress.id)) {
      throw new DuplicatePeerAccountFoundError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      assetCode: walletAddress.assetCode,
      externalRef: walletAddress.id,
      type: LedgerAccountType.LIQUIDITY_WALLET_ADDRESS,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([liquidityAccount]);

    await this.walletAddressAccountRepository.store({
      id: walletAddress.id,
      assetCode: walletAddress.assetCode,
      assetScale: walletAddress.assetScale,
      liquidityAccountId: liquidityAccount.id,
    });
  }
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

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE id = $1)`,
        [id]
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
    } catch (error) {
      logger.error({ error }, "Error storing asset account");
      throw error;
    }
  }

  public async fetchByCode(code: string): Promise<AssetAccount | undefined> {
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

interface PeerAccountRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  liquidity_account_id: string;
}

export class PeerAccountPsqlRepository implements PeerAccountRepository {
  TABLE_NAME = "peer_accounts";

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
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
    } catch (error) {
      logger.error({ error }, "Error storing peer account");
      throw error;
    }
  }

  public async fetchById(id: string): Promise<PeerAccount | undefined> {
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

  constructor(private pool: Pool) {}

  public async exists(id: string): Promise<boolean> {
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
    } catch (error) {
      logger.error({ error }, "Error storing wallet address account");
      throw error;
    }
  }

  public async fetchById(
    id: string
  ): Promise<WalletAddressAccount | undefined> {
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
        flags: 0,
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

import { AssetCreatedEvent } from "./asset";
import { IlpPeerCreatedEvent } from "./ilp-peer";
import logger from "./logger";
import { Amount } from "./shared";
import { WalletAddressCreatedEvent } from "./wallet-address";

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

export interface LiquidityRequest {
  id: string;
  type: LiquidityRequestType;
  data: Record<string, unknown>;
}

export interface WalletToWalletAddressLiquidityRequest
  extends LiquidityRequest {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS;
  data: {
    sourceWalletAddressId: string;
    sourceAmount: Amount;
    destinationWalletAddressId: string;
    destinationAmount: Amount;
  };
}

export interface FundWalletAddressLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType.DEPOSIT_WALLET_ADDRESS;
  data: {
    walletAddressId: string;
    amount: Amount;
  };
}

export interface WalletAddressToPeerLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType.WALLET_ADDRESS_TO_PEER;
  data: {
    peerId: string;
    walletAddressId: string;
    amount: Amount;
  };
}

export interface PeerToWalletAddressLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType.PEER_TO_WALLET_ADDRESS;
  data: {
    peerId: string;
    walletAddressId: string;
    amount: Amount;
  };
}

export interface LiquidityServiceAdapter {
  execute(requests: LiquidityRequest[]): Promise<void>;
}

export enum LedgerAccountType {
  LIQUIDITY_ASSET = "LIQUIDITY_ASSET",
  LIQUIDITY_PEER = "LIQUIDITY_PEER",
  LIQUIDITY_WALLET_ADDRESS = "LIQUIDITY_WALLET_ADDRESS",
  SETTLEMENT = "SETTLEMENT",
}

interface LedgerAccount {
  id: string;
  type: LedgerAccountType;
  externalRef: string;
  readonly creditsPosted: BigInt;
  readonly debitsPosted: BigInt;
}

interface AssetAccount {
  assetId: string;
  assetCode: string;
  assetScale: number;
  settlementAccountId: string;
  liquidityAccountId: string;
  lowLiquidityThreshold?: BigInt;
  highLiquidityThreshold?: BigInt;
}

interface PeerAccount {
  peerId: string;
  assetCode: string;
  assetScale: number;
  liquidityAccountId: string;
  lowLiquidityThreshold?: BigInt;
  highLiquidityThreshold?: BigInt;
}

interface WalletAddressAccount {
  walletAddressId: string;
  assetCode: string;
  assetScale: number;
  liquidityAccountId: string;
}

interface LedgerTransfer {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: BigInt;
}

interface AssetAccountRepository {
  store(entity: AssetAccount): Promise<void>;
  exists(id: string): Promise<boolean>;
  fetchById(id: string): Promise<AssetAccount | undefined>;
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

export class LiquidityService implements LiquidityServiceAdapter {
  constructor(
    private assetAccountRepository: AssetAccountRepository,
    private peerAccountRepository: PeerAccountRepository,
    private walletAddressAccountRepository: WalletAddressAccountRepository,
    private ledgerAccountRepository: LedgerAccountRepository
  ) {}

  public async execute(requests: LiquidityRequest[]): Promise<void> {
    // not implemented
  }

  public async handleAssetCreatedEvent(
    event: AssetCreatedEvent
  ): Promise<void> {
    const { asset } = event.data;

    if (await this.assetAccountRepository.exists(asset.id)) {
      throw new DuplicateAssetAccountFoundError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: asset.id,
      type: LedgerAccountType.LIQUIDITY_ASSET,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    const settlementAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: asset.id,
      type: LedgerAccountType.SETTLEMENT,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([
      liquidityAccount,
      settlementAccount,
    ]);

    await this.assetAccountRepository.store({
      assetId: asset.id,
      assetCode: asset.code,
      assetScale: asset.scale,
      settlementAccountId: settlementAccount.id,
      liquidityAccountId: liquidityAccount.id,
    });
  }

  public async handleIlpPeerCreatedEvent(
    event: IlpPeerCreatedEvent
  ): Promise<void> {
    const { peer } = event.data;

    if (await this.peerAccountRepository.exists(peer.id)) {
      throw new DuplicatePeerAccountFoundError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: peer.id,
      type: LedgerAccountType.LIQUIDITY_PEER,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([liquidityAccount]);

    await this.peerAccountRepository.store({
      peerId: peer.id,
      assetCode: peer.assetCode,
      assetScale: peer.assetScale,
      liquidityAccountId: liquidityAccount.id,
    });
  }

  public async handleWalletAddressCreatedEvent(
    event: WalletAddressCreatedEvent
  ): Promise<void> {
    if (await this.walletAddressAccountRepository.exists(event.data.id)) {
      throw new DuplicatePeerAccountFoundError();
    }

    const liquidityAccount: LedgerAccount = {
      id: crypto.randomUUID(),
      externalRef: event.data.id,
      type: LedgerAccountType.LIQUIDITY_WALLET_ADDRESS,
      creditsPosted: 0n,
      debitsPosted: 0n,
    };

    await this.ledgerAccountRepository.store([liquidityAccount]);

    await this.walletAddressAccountRepository.store({
      walletAddressId: event.data.id,
      assetCode: event.data.assetCode,
      assetScale: event.data.assetScale,
      liquidityAccountId: liquidityAccount.id,
    });
  }
}

export class InMemoryAssetAccountRepository implements AssetAccountRepository {
  map: Map<string, AssetAccount> = new Map();

  public async store(assetAccount: AssetAccount): Promise<void> {
    this.map.set(assetAccount.assetId, assetAccount);
  }

  public async exists(assetId: string): Promise<boolean> {
    return this.map.has(assetId);
  }

  public async fetchById(id: string): Promise<AssetAccount | undefined> {
    return this.map.get(id);
  }
}

export class InMemoryPeerAccountRepository implements PeerAccountRepository {
  map: Map<string, PeerAccount> = new Map();

  public async store(peerAccount: PeerAccount): Promise<void> {
    this.map.set(peerAccount.peerId, peerAccount);
  }

  public async exists(assetId: string): Promise<boolean> {
    return this.map.has(assetId);
  }

  public async fetchById(id: string): Promise<PeerAccount | undefined> {
    return this.map.get(id);
  }
}

export class InMemoryWalletAddressAccountRepository
  implements WalletAddressAccountRepository
{
  map: Map<string, WalletAddressAccount> = new Map();

  public async store(
    walletAddressAccount: WalletAddressAccount
  ): Promise<void> {
    this.map.set(walletAddressAccount.walletAddressId, walletAddressAccount);
  }

  public async exists(assetId: string): Promise<boolean> {
    return this.map.has(assetId);
  }

  public async fetchById(
    id: string
  ): Promise<WalletAddressAccount | undefined> {
    return this.map.get(id);
  }
}

export class InMemoryLedgerAccountRepository
  implements LedgerAccountRepository
{
  map: Map<string, LedgerAccount> = new Map();

  public async store(accounts: LedgerAccount[]): Promise<void> {
    for (const account of accounts) {
      this.map.set(account.id, account);
      logger.debug({ account }, "Created ledger account");
    }
  }
}

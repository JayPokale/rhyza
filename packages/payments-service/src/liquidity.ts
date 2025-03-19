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
class AccountNotFoundError extends Error {}

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
  readonly creditsPosted: bigint;
  readonly debitsPosted: bigint;
}

interface AssetAccount {
  assetId: string;
  assetCode: string;
  assetScale: number;
  settlementAccountId: string;
  liquidityAccountId: string;
  lowLiquidityThreshold?: bigint;
  highLiquidityThreshold?: bigint;
}

interface PeerAccount {
  peerId: string;
  assetCode: string;
  assetScale: number;
  liquidityAccountId: string;
  lowLiquidityThreshold?: bigint;
  highLiquidityThreshold?: bigint;
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
      amount:
        request.data.amount.value *
        10n **
          (this.LEDGER_SCALE_MAGIC_NUMBER -
            BigInt(request.data.amount.assetScale)),
    };
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

  public async fetchByCode(code: string): Promise<AssetAccount | undefined> {
    return [...this.map.values()].find(
      (assetAccount) => assetAccount.assetCode === code
    );
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
      logger.info({ account }, "Created ledger account");
    }
  }
}

export class InMemoryLedgerTransferRepository
  implements LedgerTransferRepository
{
  map: Map<string, LedgerTransfer> = new Map();

  public async create(transfers: LedgerTransfer[]): Promise<void> {
    for (const transfer of transfers) {
      this.map.set(transfer.id, transfer);
      logger.info({ transfer }, "Created ledger transfer");
    }
  }
}

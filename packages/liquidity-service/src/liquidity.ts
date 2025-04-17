import { Amount, Asset, IlpPeer, WalletAddress } from "./shared";
import {
  AssetAccountRepository,
  LedgerAccount,
  LedgerAccountRepository,
  LedgerAccountType,
  LedgerTransfer,
  LedgerTransferRepository,
  PeerAccountRepository,
  WalletAddressAccountRepository,
} from "./repository";

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
    if (await this.assetAccountRepository.existsByCode(asset.code)) {
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

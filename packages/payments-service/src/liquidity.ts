import logger from "./logger";
import { Amount } from "./shared";

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
  createWalletAddressAccount(walletAddress: {
    id: string;
    assetScale: number;
    assetCode: string;
  }): Promise<void>;
  createAssetAccount(asset: {
    id: string;
    scale: number;
    code: string;
  }): Promise<void>;
  createIlpPeerAccount(ilpPeer: {
    id: string;
    assetScale: number;
    assetCode: string;
  }): Promise<void>;
}

export class LiquidityService implements LiquidityServiceAdapter {
  constructor(private liquidityServiceUrl: string) {}

  public async execute(requests: LiquidityRequest[]): Promise<void> {
    await this.sendRequest(
      this.liquidityServiceUrl + "/transfers",
      JSON.stringify(requests)
    );
  }

  public async createAssetAccount(asset: {
    id: string;
    scale: number;
    code: string;
  }): Promise<void> {
    await this.sendRequest(
      this.liquidityServiceUrl + "/asset-account",
      JSON.stringify(asset)
    );
  }

  public async createWalletAddressAccount(walletAddress: {
    id: string;
    assetScale: number;
    assetCode: string;
  }): Promise<void> {
    await this.sendRequest(
      this.liquidityServiceUrl + "/wallet-address-account",
      JSON.stringify(walletAddress)
    );
  }

  public async createIlpPeerAccount(ilpPeer: {
    id: string;
    assetScale: number;
    assetCode: string;
  }): Promise<void> {
    await this.sendRequest(
      this.liquidityServiceUrl + "/ilp-peer-account",
      JSON.stringify(ilpPeer)
    );
  }

  private async sendRequest(url: string, body: string): Promise<void> {
    const res = await fetch(url, {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
      },
    });
  }
}

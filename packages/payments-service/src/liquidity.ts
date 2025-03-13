import { Amount } from "./shared";

export enum LiquidityRequestType {
  FUND_WALLET_ADDRESS = "FUND_WALLET_ADDRESS",
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
  type: LiquidityRequestType.FUND_WALLET_ADDRESS;
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

export class LiquidityService implements LiquidityServiceAdapter {
  requests: LiquidityRequest[] = [];

  public async execute(requests: LiquidityRequest[]): Promise<void> {
    // not implemented
  }
}

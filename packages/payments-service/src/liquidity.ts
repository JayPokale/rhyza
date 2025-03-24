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
}

export class LiquidityService implements LiquidityServiceAdapter {
  constructor() {}

  public async execute(requests: LiquidityRequest[]): Promise<void> {
    // do nothing
  }
}

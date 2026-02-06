'use strict'

import { Amount } from 'common-types-lib'
import Crypto from 'crypto'

export class DuplicateAssetAccountFoundError extends Error {}
export class DuplicatePeerAccountFoundError extends Error {}
export class AccountNotFoundError extends Error {}
export class AssetScaleTooHighError extends Error {}

export const LiquidityRequestType = {
  DEPOSIT_ASSET: 'DEPOSIT_ASSET',
  WITHDRAW_ASSET: 'WITHDRAW_ASSET',
  DEPOSIT_PEER: 'DEPOSIT_PEER',
  WITHDRAW_PEER: 'WITHDRAW_PEER',
  DEPOSIT_WALLET_ADDRESS: 'DEPOSIT_WALLET_ADDRESS',
  WITHDRAW_WALLET_ADDRESS: 'WITHDRAW_WALLET_ADDRESS',
  WALLET_ADDRESS_TO_WALLET_ADDRESS: 'WALLET_ADDRESS_TO_WALLET_ADDRESS',
  PEER_TO_WALLET_ADDRESS: 'PEER_TO_WALLET_ADDRESS',
  WALLET_ADDRESS_TO_PEER: 'WALLET_ADDRESS_TO_PEER'
} as const
export type LiquidityRequestType = keyof typeof LiquidityRequestType

export abstract class LiquidityRequest {
  id: string
  abstract amount: Amount
  abstract type: LiquidityRequestType
  abstract data: Record<string, unknown>

  protected constructor(id?: string) {
    if (id) {
      this.id = id
    } else {
      this.id = Crypto.randomUUID()
    }
  }
}

// export type LiquidityRequest =
//     | WalletToWalletAddressLiquidityRequest
//     | WalletAddressDepositLiquidityRequest
//     | WalletAddressToPeerLiquidityRequest
//     | PeerToWalletAddressLiquidityRequest;

export class WalletToWalletAddressLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType =
    LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS
  amount: Amount
  data: {
    walletAddressIdToDebit: string
    walletAddressIdToCredit: string
  }

  constructor(
    id: string,
    walletAddressIdToDebit: string,
    walletAddressIdToCredit: string,
    amount: Amount
  ) {
    super(id)
    this.amount = amount
    this.data = {
      walletAddressIdToDebit: walletAddressIdToDebit,
      walletAddressIdToCredit: walletAddressIdToCredit
    }
  }
}

export class WalletAddressDepositLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType = LiquidityRequestType.DEPOSIT_WALLET_ADDRESS
  amount: Amount
  data: {
    walletAddressId: string
  }

  constructor(id: string, walletAddressId: string, amount: Amount) {
    super(id)
    this.amount = amount
    this.data = {
      walletAddressId: walletAddressId
    }
  }
}

export class WalletAddressToPeerLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType = LiquidityRequestType.WALLET_ADDRESS_TO_PEER
  amount: Amount
  data: {
    walletAddressId: string
    peerId: string
  }

  constructor(
    id: string,
    walletAddressId: string,
    peerId: string,
    amount: Amount
  ) {
    super(id)
    this.amount = amount
    this.data = {
      walletAddressId: walletAddressId,
      peerId: peerId
    }
  }
}

export class PeerToWalletAddressLiquidityRequest extends LiquidityRequest {
  type: LiquidityRequestType = LiquidityRequestType.PEER_TO_WALLET_ADDRESS
  amount: Amount
  data: {
    peerId: string
    walletAddressId: string
  }

  constructor(
    id: string,
    peerId: string,
    walletAddressId: string,
    amount: Amount
  ) {
    super(id)
    this.amount = amount
    this.data = {
      peerId: peerId,
      walletAddressId: walletAddressId
    }
  }
}

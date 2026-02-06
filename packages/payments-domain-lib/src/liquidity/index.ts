'use strict'

import { LiquidityRequest } from 'liquidity-types-lib'

export interface ILiquidityService {
  execute(requests: LiquidityRequest[]): Promise<void>

  createWalletAddressAccount(walletAddress: {
    id: string
    assetScale: number
    assetCode: string
  }): Promise<void>

  createAssetAccount(asset: {
    id: string
    scale: number
    code: string
  }): Promise<void>

  createIlpPeerAccount(ilpPeer: {
    id: string
    assetScale: number
    assetCode: string
  }): Promise<void>
}

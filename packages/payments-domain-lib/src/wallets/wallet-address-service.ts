'use strict'

import { CreateWalletAddressArgs } from './wallet-address-types'
import { ILiquidityService } from '../liquidity'
import {
  DuplicateWalletAddressFoundError,
  InvalidIdLengthError
} from '../errors'
import {
  IWalletAddressRepository,
  IWalletAddressService
} from './wallet-address-types'
import { WalletAddress } from 'common-types-lib'

export class WalletAddressService implements IWalletAddressService {
  constructor(
    private walletAddressRepository: IWalletAddressRepository,
    private liquidityService: ILiquidityService
  ) {}

  public async createWalletAddress(
    args: CreateWalletAddressArgs
  ): Promise<string> {
    let id: string

    if (args.id) {
      if (args.id.length > 64) {
        throw new InvalidIdLengthError(
          'Wallet Address ID is too long (max 64 characters)'
        )
      }

      const existingWalletAddress = await this.walletAddressRepository.exists(
        args.id
      )

      if (existingWalletAddress) {
        throw new DuplicateWalletAddressFoundError()
      }
      id = args.id
    } else {
      id = crypto.randomUUID()
    }

    // TODO: throw this error?
    // if (args.url.length === 0) {
    //   throw new InvalidWalletAddressURLError();
    // }

    const walletAddress: WalletAddress = {
      ...args,
      isActive: true,
      id
    }

    await this.walletAddressRepository.store(walletAddress)

    await this.liquidityService.createWalletAddressAccount({
      id: walletAddress.id,
      assetScale: walletAddress.assetScale,
      assetCode: walletAddress.assetCode
    })

    return id
  }

  public getById(id: string): Promise<WalletAddress | undefined> {
    return this.walletAddressRepository.fetchById(id)
  }
}

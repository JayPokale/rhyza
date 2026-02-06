'use strict'

import {
  IIlpPeerRepository,
  IlpPeer,
  CreateIlpPeerArgs
} from './ilp-peer-types'
import { ILiquidityService } from '../liquidity'

export class IlpPeerService implements IlpPeerService {
  constructor(
    private peerRepository: IIlpPeerRepository,
    private liquidityService: ILiquidityService
  ) {}

  public async getById(id: string): Promise<IlpPeer | undefined> {
    return this.peerRepository.fetchById(id)
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return this.peerRepository.getByDestinationAddress(address)
  }

  public async create(args: CreateIlpPeerArgs): Promise<string> {
    const newPeer: IlpPeer = {
      ...args,
      id: crypto.randomUUID()
    }

    await this.peerRepository.store(newPeer)

    await this.liquidityService.createIlpPeerAccount({
      id: newPeer.id,
      assetScale: newPeer.asset.scale,
      assetCode: newPeer.asset.code
    })

    return newPeer.id
  }
}

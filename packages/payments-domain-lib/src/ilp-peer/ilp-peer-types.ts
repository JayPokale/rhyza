'use strict'

import { Asset } from 'common-types-lib'

export type IlpPeer = {
  id: string
  asset: Asset
  address: string
  connectorUrl: string
  callbackUrl: string
}

export type CreateIlpPeerArgs = {
  asset: Asset
  address: string
  connectorUrl: string
  callbackUrl: string
}

export interface IIlpPeerRepository {
  store(walletAddress: IlpPeer): Promise<void>
  fetchById(id: string): Promise<IlpPeer | undefined>
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>
}

export interface IIlpPeerService {
  getById(id: string): Promise<IlpPeer | undefined>
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>
  create(args: CreateIlpPeerArgs): Promise<string>
}

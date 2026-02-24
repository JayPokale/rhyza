/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

export interface IPalWalletAddress {
  address: string;
  publicName: string;
  assetCode: string;
  assetScale: number;
  isActive: boolean;
}

export interface IWalletAddressAggregate {
  createWalletAddress(
    address: string,
    publicName: string,
    assetCode: string,
    assetScale: number,
    isActive?: boolean
  ): Promise<string>;
  getWalletAddress(code: string): Promise<IPalWalletAddress | null>;
}

export interface IPalWalletAddressRepository {
  store(asset: IPalWalletAddress): Promise<void>;
  fetch(address: string): Promise<IPalWalletAddress | null>;
  // fetchByPublicName(publicName:string):Promise<IPalWalletAddress | null>;
}

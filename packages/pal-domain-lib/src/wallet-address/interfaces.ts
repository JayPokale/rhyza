/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

export interface IPalWalletAddress {
  id: string;
  publicName: string;
  assetCode: string;
  assetScale: number;
  isActive: boolean;

  aliases: IPalWalletAddressAlias[];
}

export interface IPalWalletAddressAlias {
  domain: string | null;
  pathName: string;
  walletId: string;
}


export interface IPalWalletAddressRepository {
  store(walletAddress: IPalWalletAddress): Promise<void>;
  fetch(ids: string[]): Promise<IPalWalletAddress[]>;

  getByAlias(domain: string | null, pathName: string): Promise<IPalWalletAddress | null>;
}

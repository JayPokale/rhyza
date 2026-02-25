/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import { IPalWalletAddress, IPalWalletAddressRepository } from 'pal-domain-lib';

export class MockWalletRepo implements IPalWalletAddressRepository {
  private _data: Map<string, IPalWalletAddress> = new Map<
    string,
    IPalWalletAddress
  >();

  store(wallet: IPalWalletAddress): Promise<void> {
    this._data.set(wallet.address, wallet);
    return Promise.resolve();
  }

  fetch(address: string): Promise<IPalWalletAddress | null> {
    return Promise.resolve(this._data.get(address) ?? null);
  }

}

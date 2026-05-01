/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import {IPalWalletAddress, IPalWalletAddressAlias, IPalWalletAddressRepository} from '../../src';

export class MockWalletRepo implements IPalWalletAddressRepository {
  private _data: Map<string, IPalWalletAddress> = new Map<
    string,
    IPalWalletAddress
  >();

  store(wallet: IPalWalletAddress): Promise<void> {
    this._data.set(wallet.id, wallet);
    return Promise.resolve();
  }

  fetch(ids: string[]): Promise<IPalWalletAddress[]> {
    const ret = Array.from(this._data.values()).filter((item) =>
      ids.includes(item.id)
    );
    return Promise.resolve(ret);
  }

  getByAlias(domain: string | null, pathName: string): Promise<IPalWalletAddress | null> {
    let found: IPalWalletAddress | null = null;
    this._data.forEach(wallet => {
      wallet.aliases.forEach(alias => {
        if(alias.domain === domain && alias.pathName === pathName) {
          found = wallet;
          return;
        }
      });
    });
    return Promise.resolve(found);
  }
}

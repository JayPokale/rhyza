'use strict';

import { JWK, createUnauthenticatedClient } from '@interledger/open-payments';

import { IWalletAddressService } from 'auth-domain-lib';

export class WalletAddressAdapter implements IWalletAddressService {
  async getWalletAddressKeys(walletAddressUrl: string): Promise<JWK[]> {
    const client = await createUnauthenticatedClient({});

    const { keys } = await client.walletAddress.getKeys({
      url: walletAddressUrl
    });

    return keys;
  }
}

'use strict';

import { JWK, createUnauthenticatedClient } from '@interledger/open-payments';

import { IWalletAddressService } from 'auth-domain-lib';

export class WalletAddressAdapter implements IWalletAddressService {
  async getWalletAddressKeys(url: string): Promise<JWK[]> {
    const client = await createUnauthenticatedClient({});

    const { keys } = await client.walletAddress.getKeys({ url });

    return keys;
  }
}

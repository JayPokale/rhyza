import { IPalWalletAddressKeyDto } from 'pal-public-types-lib';
import { IPalWalletAddressKeyRepository } from '../../src';

export class MockWalletAddressKeyRepo
  implements IPalWalletAddressKeyRepository
{
  private _data: Map<string, IPalWalletAddressKeyDto> = new Map();

  store(key: IPalWalletAddressKeyDto): Promise<void> {
    this._data.set(key.id, key);
    return Promise.resolve();
  }

  fetchByWalletAddressId(
    walletAddressId: string
  ): Promise<IPalWalletAddressKeyDto[]> {
    const keys = Array.from(this._data.values()).filter(
      (item) => item.walletAddressId === walletAddressId
    );
    return Promise.resolve(keys);
  }
}

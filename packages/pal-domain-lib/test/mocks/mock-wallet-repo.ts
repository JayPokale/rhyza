import {
  IPalWalletAddressDto,
  IPalWalletAddressKeyDto
} from 'pal-public-types-lib';
import {
  DuplicateWalletAddressKeyError,
  IPalWalletAddressRepository
} from '../../src';

export class MockWalletRepo implements IPalWalletAddressRepository {
  private _data: Map<string, IPalWalletAddressDto> = new Map<
    string,
    IPalWalletAddressDto
  >();
  private _keys: Map<string, IPalWalletAddressKeyDto[]> = new Map();

  store(wallet: IPalWalletAddressDto): Promise<void> {
    this._data.set(wallet.id, {
      id: wallet.id,
      publicName: wallet.publicName,
      assetCode: wallet.assetCode,
      assetScale: wallet.assetScale,
      isActive: wallet.isActive,
      aliases: wallet.aliases
    });
    return Promise.resolve();
  }

  storeKey(key: IPalWalletAddressKeyDto): Promise<void> {
    const existing = this._keys.get(key.walletAddressId) ?? [];
    if (existing.some((stored) => stored.jwk.kid === key.jwk.kid)) {
      throw new DuplicateWalletAddressKeyError(
        `Wallet address key with kid ${key.jwk.kid} already exists`
      );
    }

    this._keys.set(key.walletAddressId, [...existing, key]);
    return Promise.resolve();
  }

  fetch(ids: string[]): Promise<IPalWalletAddressDto[]> {
    const ret = Array.from(this._data.values())
      .filter((item) => ids.includes(item.id))
      .map((wallet) => this._withKeys(wallet));
    return Promise.resolve(ret);
  }

  getByAlias(
    domain: string | null,
    pathName: string
  ): Promise<IPalWalletAddressDto | null> {
    let found: IPalWalletAddressDto | null = null;
    this._data.forEach((wallet) => {
      wallet.aliases.forEach((alias) => {
        if (alias.domain === domain && alias.pathName === pathName) {
          found = wallet;
          return;
        }
      });
    });
    return Promise.resolve(found ? this._withKeys(found) : null);
  }

  private _withKeys(wallet: IPalWalletAddressDto): IPalWalletAddressDto {
    return {
      ...wallet,
      keys: this._keys.get(wallet.id) ?? []
    };
  }
}

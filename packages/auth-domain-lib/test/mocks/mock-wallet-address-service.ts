import { IJsonWebKey, IWalletAddressService } from '../../src/grant/interfaces';

export class MockWalletAddressService implements IWalletAddressService {
  private _keysByWalletAddress: Map<string, IJsonWebKey[]> = new Map();

  setKeys(walletAddress: string, keys: IJsonWebKey[]): void {
    this._keysByWalletAddress.set(walletAddress, keys);
  }

  async getWalletAddressKeys(url: string): Promise<IJsonWebKey[]> {
    return this._keysByWalletAddress.get(url) ?? [];
  }
}

import { IJsonWebKey, IWalletAddressService } from '../../src/grant/interfaces';

export class MockWalletAddressService implements IWalletAddressService {
  private _keysByWalletAddress: Map<string, IJsonWebKey[]> = new Map();
  private _publicNameByWalletAddress: Map<string, string> = new Map();

  setKeys(walletAddress: string, keys: IJsonWebKey[]): void {
    this._keysByWalletAddress.set(walletAddress, keys);
  }

  setPublicName(walletAddress: string, publicName: string): void {
    this._publicNameByWalletAddress.set(walletAddress, publicName);
  }

  async getWalletAddressKeys(url: string): Promise<IJsonWebKey[]> {
    return this._keysByWalletAddress.get(url) ?? [];
  }

  async getWalletAddressPublicName(url: string): Promise<string | undefined> {
    return this._publicNameByWalletAddress.get(url);
  }
}

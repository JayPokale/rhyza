import { IWalletAddressPort, WalletAddress } from '../../src/payment-intent/interfaces';

export class MockWalletAddressPort implements IWalletAddressPort {
  private _wallets: Map<string, WalletAddress> = new Map();

  addWallet(wallet: WalletAddress): void {
    this._wallets.set(wallet.id, wallet);
  }

  async fetchByIds(ids: string[]): Promise<WalletAddress[]> {
    const results: WalletAddress[] = [];
    for (const id of ids) {
      const w = this._wallets.get(id);
      if (w) results.push(w);
    }
    return results;
  }
}

import { IWalletAddressService, WalletAddress } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';

export class PalWalletAddressAdapter implements IWalletAddressService {
  private _palClient: PalClient;

  constructor(palClient: PalClient) {
    this._palClient = palClient;
  }

  // TODO: PAL uses "address" (a URL string) as the wallet address key, but
  // the payments domain and benchmark use UUIDs as walletAddressId. Need to
  // reconcile — either PAL needs a UUID-based lookup, or the payments domain
  // needs to use address URLs as the identifier. See benchmark.js for context.
  async fetchByIds(ids: string[]): Promise<WalletAddress[]> {
    const results: WalletAddress[] = [];

    // PAL client only supports singular getWalletAddress — loop over it.
    const settled = await Promise.all(
      ids.map((id) => this._palClient.getWalletAddress(id))
    );

    for (const wallet of settled) {
      if (wallet) {
        results.push({
          id: wallet.address,
          isActive: wallet.isActive,
          assetCode: wallet.assetCode,
          assetScale: wallet.assetScale
        });
      }
    }

    return results;
  }
}

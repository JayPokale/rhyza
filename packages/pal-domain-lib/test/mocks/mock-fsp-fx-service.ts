import { IPalFspFxService } from '../../src';
import { IPalFxRateDto } from 'pal-public-types-lib';

export class MockFspFxService implements IPalFspFxService {
  rates: IPalFxRateDto[];
  defaultExpirationMs: number = 1 * 60 * 60 * 1000; // 1 hour
  defaultRate: number = 1.0;

  getIntraFspFxRate(
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<{ rate: number; expiresAt: number }> {
    const rate = this.rates?.find(
      (r) =>
        r.sourceAssetCode === sourceAssetCode &&
        r.destinationAssetCode === destinationAssetCode
    );
    if (rate) {
      return Promise.resolve({ rate: rate.rate, expiresAt: rate.expiresAt });
    }

    return Promise.resolve({
      rate: this.defaultRate,
      expiresAt: Date.now() + this.defaultExpirationMs
    });
  }

  getPeerFxFromFsp(
    sourceAssetCode: string,
    destinationAssetCode: string,
    peerId: string
  ): Promise<{ rate: number; expiresAt: number }> {
    const rate = this.rates?.find(
      (r) =>
        r.sourceAssetCode === sourceAssetCode &&
        r.destinationAssetCode === destinationAssetCode &&
        r.peerId === peerId
    );
    if (rate) {
      return Promise.resolve({ rate: rate.rate, expiresAt: rate.expiresAt });
    }

    return Promise.resolve({
      rate: this.defaultRate,
      expiresAt: Date.now() + this.defaultExpirationMs
    });
  }
}

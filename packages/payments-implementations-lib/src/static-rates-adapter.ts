import { IRatesServiceAdapter } from 'payments-domain-lib';

export class StaticRatesService implements IRatesServiceAdapter {
  public async getRate(
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<number | undefined> {
    return 1;
  }
}

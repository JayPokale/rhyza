import { IRatesServiceAdapter } from '../../src/payment-intent/interfaces';

export class MockRatesServiceAdapter implements IRatesServiceAdapter {
  public exchangeRate = 1;

  async getRate(
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<number | undefined> {
    return 1;
  }
}

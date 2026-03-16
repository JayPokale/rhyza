import { IRatesServiceAdapter } from '../../src/payment-intent/interfaces';

export class MockRatesServiceAdapter implements IRatesServiceAdapter {
  public exchangeRate = 1;

  async getRate(): Promise<number | undefined> {
    return 1;
  }
}

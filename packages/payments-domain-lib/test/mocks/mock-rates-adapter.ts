import { IRatesService } from '../../src/payment-intent/interfaces';

export class MockRatesAdapter implements IRatesService {
  public exchangeRate = 1;

  async getRate(): Promise<number | undefined> {
    return 1;
  }
}

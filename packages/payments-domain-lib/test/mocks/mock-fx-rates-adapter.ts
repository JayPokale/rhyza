import {
  IFxRatesService,
  IFxRateRequest
} from '../../src/payment-intent/interfaces';

export class MockFxRatesAdapter implements IFxRatesService {
  async getRates(_request: IFxRateRequest): Promise<number | null> {
    return 1;
  }
}

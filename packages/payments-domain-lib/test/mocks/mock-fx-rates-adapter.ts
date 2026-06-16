import {
  IFxRatesService,
  IFxRateRequest
} from '../../src/payment-intent/interfaces';

export class MockFxRatesAdapter implements IFxRatesService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getRates(_request: IFxRateRequest): Promise<number | null> {
    return 1;
  }
}

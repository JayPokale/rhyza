import { IFxRatesService, IFxRateRequest } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';

export class PalRatesAdapter implements IFxRatesService {
  constructor(private _palClient: PalClient) {}

  async getRates(request: IFxRateRequest): Promise<number | null> {
    return this._palClient.getFxRate(request);
  }
}

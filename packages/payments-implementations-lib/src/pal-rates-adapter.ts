import { IFxRatesService, IFxRateRequest } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';

export class PalRatesAdapter implements IFxRatesService {
  constructor(private _palClient: PalClient) {}

  async getRates(_request: IFxRateRequest): Promise<number | null> {
    // return this._palClient.getFxRate(_request);
    return null;
  }
}

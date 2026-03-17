import { IRatesService } from 'payments-domain-lib';

export class StaticRatesAdapter implements IRatesService {
  public async getRate(): Promise<number | undefined> {
    return 1;
  }
}

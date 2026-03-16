import { IRatesServiceAdapter } from 'payments-domain-lib';

export class StaticRatesService implements IRatesServiceAdapter {
  public async getRate(): Promise<number | undefined> {
    return 1;
  }
}

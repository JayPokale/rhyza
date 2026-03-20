import {
  IPaymentIntent,
  IPaymentIntentRepository
} from '../../src/payment-intent/interfaces';

export class MockPaymentIntentRepo implements IPaymentIntentRepository {
  private _store: Map<string, IPaymentIntent> = new Map();

  async storeMany(payments: IPaymentIntent[]): Promise<void> {
    for (const p of payments) {
      this._store.set(p.id, p);
    }
  }

  async fetchByIds(ids: string[]): Promise<IPaymentIntent[]> {
    const results: IPaymentIntent[] = [];
    for (const id of ids) {
      const p = this._store.get(id);
      if (p) results.push(p);
    }
    return results;
  }

  async storeQuotes(
    quoteUpdates: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void> {
    for (const update of quoteUpdates) {
      this._store.set(update.paymentIntent.id, update.paymentIntent);
    }
  }

  async storePayments(
    paymentUpdate: { paymentIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void> {
    for (const update of paymentUpdate) {
      this._store.set(update.paymentIntent.id, update.paymentIntent);
    }
  }

  getAll(): IPaymentIntent[] {
    return [...this._store.values()];
  }
}

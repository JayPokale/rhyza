import {
  IRemotePaymentIntentService,
  RemotePaymentIntentDetails
} from '../../src/payment-intent/interfaces';

export class MockRemotePaymentIntentService implements IRemotePaymentIntentService {
  async fetchIncomingPayment(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _url: string
  ): Promise<RemotePaymentIntentDetails> {
    throw new Error('Not implemented');
  }
}

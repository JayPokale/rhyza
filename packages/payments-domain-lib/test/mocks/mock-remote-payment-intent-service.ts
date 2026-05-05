import {
  IRemotePaymentIntentService,
  RemotePaymentIntentDetails
} from '../../src/payment-intent/interfaces';

export class MockRemotePaymentIntentService
  implements IRemotePaymentIntentService
{
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchIncomingPayment(_url: string): Promise<RemotePaymentIntentDetails> {
    throw new Error('Not implemented');
  }
}

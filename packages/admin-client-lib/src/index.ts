import {
  AssetsApi,
  Configuration,
  PaymentIntentsApi,
  PaymentsApi,
  QuotesApi,
  WalletAddressesApi
} from './generated';

export interface AdminApiClient {
  assets: AssetsApi;
  paymentIntents: PaymentIntentsApi;
  payments: PaymentsApi;
  quotes: QuotesApi;
  walletAddresses: WalletAddressesApi;
}

export function createAdminClient(
  baseUrl: string,
  apiKey?: string
): AdminApiClient {
  const configuration = new Configuration({ basePath: baseUrl, apiKey });
  return {
    assets: new AssetsApi(configuration),
    paymentIntents: new PaymentIntentsApi(configuration),
    payments: new PaymentsApi(configuration),
    quotes: new QuotesApi(configuration),
    walletAddresses: new WalletAddressesApi(configuration)
  };
}

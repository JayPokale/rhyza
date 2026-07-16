import {
  AssetsApi,
  Configuration,
  Middleware,
  PaymentIntentsApi,
  PaymentsApi,
  PeersApi,
  QuotesApi,
  WalletAddressesApi
} from './generated';

export interface AdminApiClient {
  peers: PeersApi;
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
  const middleware: Middleware = {
    pre: async (context) => {
      console.log(context);
      return Promise.resolve();
    },
    post: async (context) => {
      console.log(context);
      return Promise.resolve();
    },
    onError: async (context) => {
      console.error(context);
      return Promise.reject();
    }
  };
  const configuration = new Configuration({
    basePath: baseUrl,
    apiKey,
    middleware: [middleware]
  });

  return {
    peers: new PeersApi(configuration),
    assets: new AssetsApi(configuration),
    paymentIntents: new PaymentIntentsApi(configuration),
    payments: new PaymentsApi(configuration),
    quotes: new QuotesApi(configuration),
    walletAddresses: new WalletAddressesApi(configuration)
  };
}

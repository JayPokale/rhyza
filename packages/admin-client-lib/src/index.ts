import {
  AssetsApi,
  Configuration,
  HTTPHeaders,
  Middleware,
  PaymentIntentsApi,
  PaymentsApi,
  PeersApi,
  QuotesApi,
  WalletAddressesApi
} from './generated';

export * from './generated/models/index';
export * from './generated/apis/index';

export interface AdminApiClient {
  peers: PeersApi;
  assets: AssetsApi;
  paymentIntents: PaymentIntentsApi;
  payments: PaymentsApi;
  quotes: QuotesApi;
  walletAddresses: WalletAddressesApi;
}

type AdminApiBuilder = {
  apiKey(apiKey: string): AdminApiBuilder;
  withMiddleware(middleware: Middleware): AdminApiBuilder;
  withHeader(key: string, value: string): AdminApiBuilder;
  build(): AdminApiClient;
};

const AdminApi = {
  baseUrl(baseUrl: string): AdminApiBuilder {
    let apiKey: string | undefined;
    const middlewares: Middleware[] = [];
    const headers: HTTPHeaders = {};

    const builder: AdminApiBuilder = {
      apiKey(key: string) {
        apiKey = key;
        return builder;
      },

      withMiddleware(middleware: Middleware) {
        middlewares.push(middleware);
        return builder;
      },

      withHeader(key: string, value: string) {
        headers[key] = value;
        return builder;
      },

      build() {
        const configuration = new Configuration({
          basePath: baseUrl,
          apiKey,
          middleware: middlewares
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
    };

    return builder;
  }
};

export default AdminApi;

export function createAdminClient(
  baseUrl: string,
  apiKey?: string
): AdminApiClient {
  const configuration = new Configuration({
    basePath: baseUrl,
    apiKey
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

import {
  AssetsApi,
  Configuration,
  LiquidityApi,
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
  liquidity: LiquidityApi;
  paymentIntents: PaymentIntentsApi;
  payments: PaymentsApi;
  quotes: QuotesApi;
  walletAddresses: WalletAddressesApi;
}

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
    liquidity: new LiquidityApi(configuration),
    paymentIntents: new PaymentIntentsApi(configuration),
    payments: new PaymentsApi(configuration),
    quotes: new QuotesApi(configuration),
    walletAddresses: new WalletAddressesApi(configuration)
  };
}

export const PaymentIntentState = {
  CREATED: 'CREATED',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED'
} as const;
export type PaymentIntentState = keyof typeof PaymentIntentState;

export interface IPaymentIntent {
  id: string;
  walletAddressId: string;
  state: PaymentIntentState;
  assetCode: string;
  assetScale: number;
  expiresAt: Date;
  incomingAmount: bigint | null;
  receivedAmount: bigint;
}

export interface WalletAddress {
  id: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

// TODO: is this the right name? Would IWalletAddressPort be wrong because its
// from another domain/bounded context? Options include:
// - IWalletAddressRepository
// - IWalletAddressClient
// - IWalletAddressProvider
// - IWalletAddressGateway
export interface IWalletAddressPort {
  fetchByIds(ids: string[]): Promise<WalletAddress[]>;
}

export interface IPaymentIntentRepository {
  storeMany(payments: IPaymentIntent[]): Promise<void>;
  fetchByIds(ids: string[]): Promise<IPaymentIntent[]>;
}

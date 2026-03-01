export const IncomingPaymentState = {
  CREATED: 'CREATED',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED'
} as const;
export type IncomingPaymentState = keyof typeof IncomingPaymentState;

export interface IIncomingPayment {
  id: string;
  walletAddressId: string;
  state: IncomingPaymentState;
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
// - IWalletAddressProvider
// - IWalletAddressGateway
// - IWalletAddressRepository
// - IWalletAddressClient
export interface IWalletAddressPort {
  fetchByIds(ids: string[]): Promise<WalletAddress[]>;
}

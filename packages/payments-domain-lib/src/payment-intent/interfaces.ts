export const PaymentIntentState = {
  CREATED: 'CREATED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  EXPIRED: 'EXPIRED',
  COMPLETED: 'COMPLETED'
} as const;
export type PaymentIntentState = keyof typeof PaymentIntentState;

export const PaymentIntentDestination = {
  LOCAL: 'LOCAL',
  REMOTE: 'REMOTE'
} as const;
export type PaymentIntentDestination = keyof typeof PaymentIntentDestination;

export const QuoteState = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED'
} as const;
export type QuoteState = keyof typeof QuoteState;

export interface IQuote {
  id: string;
  state: QuoteState;
  senderWalletAddress: string;
  senderWalletAddressId: string;

  // The amounts might be defined only after getting the ILP quote
  expiresAt?: Date;
  debitAmount?: bigint;
  receiveAmount?: bigint;
  exchangeRate?: number;
}

export interface IPaymentIntent {
  id: string;
  receiverWalletAddressId: string;
  receiverWalletAddress: string;
  state: PaymentIntentState;
  destination: PaymentIntentDestination;
  assetCode: string;
  assetScale: number;
  expiresAt: Date;
  incomingAmount: bigint | null;
  receivedAmount: bigint;
  quotes: IQuote[];
}

export interface WalletAddress {
  id: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

export interface IWalletAddressAdapter {
  fetchByIds(ids: string[]): Promise<WalletAddress[]>;
}

export interface IRatesServiceAdapter {
  getRate(
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<number | undefined>;
}

export interface IPaymentIntentRepository {
  storeMany(paymentIntents: IPaymentIntent[]): Promise<void>;
  fetchByIds(ids: string[]): Promise<IPaymentIntent[]>;
  storeQuotes(
    quoteUpdate: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
}

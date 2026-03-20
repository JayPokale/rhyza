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

interface BaseQuote {
  id: string;
  state: QuoteState;
  senderWalletAddress: string;
  senderWalletAddressId: string;
}

interface PendingQuote extends BaseQuote {
  state: 'PENDING';
  senderWalletAddress: string;
  senderWalletAddressId: string;
}

interface CompletedQuote extends BaseQuote {
  state: 'COMPLETED';
  expiresAt: Date;
  debitAmount: bigint;
  receiveAmount: bigint;
  exchangeRate: number;
}

export type IQuote = PendingQuote | CompletedQuote;

export const PaymentState = {
  CREATED: 'CREATED',
  COMPLETED: 'COMPLETED'
} as const;
export type PaymentState = keyof typeof PaymentState;

export interface IPayment {
  id: string;
  state: PaymentState;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  paymentIntentId: string;
  assetCode: string;
  assetScale: number;
  quoteId?: string;
  debitAmount: bigint;
  receiveAmount: bigint;
  sentAmount: bigint;
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
  payments: IPayment[];
}

export interface WalletAddress {
  id: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

export interface IWalletAddressService {
  fetchByIds(ids: string[]): Promise<WalletAddress[]>;
}

export interface IRatesService {
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
  storePayments(
    paymentUpdate: { paymentIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
}

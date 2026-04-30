export const PaymentIntentState = {
  CREATED: 'CREATED',
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
  receiverWalletAddressId?: string;
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
  destinationIlpAddress?: string;
  remoteUrl?: string;
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

export interface RemotePaymentIntentDetails {
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  incomingAmount?: bigint;
  receivedAmount: bigint;
  expiresAt?: string;
  destinationIlpAddress: string;
}

export interface IRemotePaymentIntentPort {
  fetchIncomingPayment(url: string): Promise<RemotePaymentIntentDetails>;
}

export interface IIlpClientPort {
  resolvePeerByAddress(destinationIlpAddress: string): Promise<{ peerId: string }>;
}

export interface IPaymentIntentRepository {
  storeMany(paymentIntents: IPaymentIntent[]): Promise<void>;
  fetchByIdsWithPayments(ids: string[]): Promise<IPaymentIntent[]>;
  storeQuotes(
    quoteUpdates: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
  storePayments(
    paymentUpdates: { paymentIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
  storeCompletedLocalPayments(
    paymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      payments: { id: string; state: PaymentState; sentAmount: bigint }[];
    }[]
  ): Promise<void>;
  storeCompletedRemoteQuotes(
    updates: {
      paymentIntentId: string;
      quoteId: string;
      debitAmount: bigint;
      receiveAmount: bigint;
      exchangeRate: number;
      expiresAt: Date;
    }[]
  ): Promise<void>;
  fetchByRemoteUrls(urls: string[]): Promise<Array<{ id: string; remoteUrl: string }>>;
}

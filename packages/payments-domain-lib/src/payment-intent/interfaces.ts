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
  expiresAt: Date;

  // The amounts might be defined only after getting the ILP quote
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

export interface SourceConversionRequest {
  sourceAmount: bigint;
  sourceAsset: {
    scale: number;
    code: string;
  };
  destinationAsset: {
    scale: number;
    code: string;
  };
}

export interface SourceConversionResponse {
  destinationAmount: bigint;
  exchangeRate: number;
}

export interface DestinationConversionRequest {
  sourceAsset: {
    scale: number;
    code: string;
  };
  destinationAsset: {
    scale: number;
    code: string;
  };
  destinationAmount: bigint;
}

export interface DestinationConversionResponse {
  sourceAmount: bigint;
  exchangeRate: number;
}

export interface IRatesServiceAdapter {
  convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined>;
  convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined>;
}

export interface IPaymentIntentRepository {
  storeMany(paymentIntents: IPaymentIntent[]): Promise<void>;
  fetchByIds(ids: string[]): Promise<IPaymentIntent[]>;
  storeQuotes(
    quoteUpdate: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
}

import {
  PaymentIntentState,
  SentPaymentState,
  ReceivedPaymentState
} from 'payments-public-types-lib';

export { PaymentIntentState, SentPaymentState, ReceivedPaymentState };

export const PaymentIntentDestination = {
  LOCAL: 'LOCAL',
  REMOTE: 'REMOTE'
} as const;
export type PaymentIntentDestination = keyof typeof PaymentIntentDestination;

export const QuoteState = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;
export type QuoteState = keyof typeof QuoteState;

export interface IBaseQuote {
  id: string;
  state: QuoteState;
  senderWalletAddress: string;
  senderWalletAddressId: string;
}

export interface IPendingQuote extends IBaseQuote {
  state: 'PENDING';
  debitAmount?: bigint;
  receiveAmount?: bigint;
  peerId?: string;
  peerAssetCode?: string;
  peerAssetScale?: number;
  sourceAmount?: bigint;
  senderAssetCode?: string;
}

export interface ICompletedQuote extends IBaseQuote {
  state: 'COMPLETED';
  expiresAt: Date;
  debitAmount: bigint;
  receiveAmount: bigint;
  exchangeRate: number;
}

export interface IFailedQuote extends IBaseQuote {
  state: 'FAILED';
  errorName: string;
  message: string;
}

export type IQuote = IPendingQuote | ICompletedQuote | IFailedQuote;

export interface ISentPayment {
  id: string;
  state: SentPaymentState;
  senderWalletAddress: string;
  senderWalletAddressId: string;
  paymentIntentId: string;
  assetCode: string;
  assetScale: number;
  createdAt: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  quoteId?: string;
  debitAmount: bigint;
  receiveAmount: bigint;
  sentAmount: bigint;
  ledgerTransferId?: string;
  failReason?: string;
}

export interface IReceivedPayment {
  id: string;
  state: ReceivedPaymentState;
  paymentIntentId: string;
  packetId: string;
  peerId: string;
  peerAssetCode: string;
  peerAssetScale: number;
  sourceAmount: bigint;
  receiveAmount: bigint;
  createdAt: Date;
  ledgerTransferId?: string;
  failReason?: string;
}

export interface IPaymentIntent {
  id: string;
  receiverWalletAddressId?: string;
  receiverWalletAddress: string;
  state: PaymentIntentState;
  destination: PaymentIntentDestination;
  assetCode: string;
  assetScale: number;
  createdAt: Date;
  expiresAt: Date;
  incomingAmount: bigint | null;
  receivedAmount: bigint;
  quotes: IQuote[];
  sentPayments: ISentPayment[];
  receivedPayments: IReceivedPayment[];
  destinationIlpAddress?: string;
  remoteUrl?: string;
}

export interface IWalletAddress {
  id: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

export type IFxRateRequest =
  | { peerId: string; sourceAssetCode: string }
  | { peerId: string; destinationAssetCode: string }
  | { sourceAssetCode: string; destinationAssetCode: string };

export interface IPeer {
  peerId: string;
  assetCode: string;
  assetScale: number;
}

export interface IPalService {
  getWalletAddresses(ids: string[]): Promise<IWalletAddress[]>;
  getPeerByIlpAddress(ilpAddress: string): Promise<IPeer | null>;
  getRates(request: IFxRateRequest): Promise<number | null>;
}

export interface IRemotePaymentIntentDetails {
  walletAddress: string;
  assetCode: string;
  assetScale: number;
  incomingAmount?: bigint;
  receivedAmount: bigint;
  expiresAt?: string;
  destinationIlpAddress: string;
  sharedSecret: string;
}

export interface IRemotePaymentIntentService {
  fetchIncomingPayment(url: string): Promise<IRemotePaymentIntentDetails>;
}

export type FinalizedRemoteQuoteUpdate =
  | {
      paymentIntentId: string;
      quoteId: string;
      state: 'COMPLETED';
      debitAmount: bigint;
      receiveAmount: bigint;
      exchangeRate: number;
      expiresAt: Date;
    }
  | {
      paymentIntentId: string;
      quoteId: string;
      state: 'FAILED';
      errorName: string;
      message: string;
    };

export interface IPaymentIntentRepository {
  storeMany(paymentIntents: IPaymentIntent[]): Promise<void>;
  fetchByIds(
    ids: string[]
  ): Promise<Omit<IPaymentIntent, 'sentPayments' | 'receivedPayments'>[]>;
  fetchByIdsWithPayments(ids: string[]): Promise<IPaymentIntent[]>;
  fetchIdsByRemoteUrls(
    urls: string[]
  ): Promise<Array<{ id: string; remoteUrl: string }>>;
  storeQuotes(
    quoteUpdates: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
  storeSentPayments(
    paymentUpdates: { paymentIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void>;
  storeReceivedPayments(
    receivedPaymentUpdates: {
      receivedPaymentIds: string[];
      paymentIntent: IPaymentIntent;
    }[]
  ): Promise<void>;
  storeAcceptedReceivedPayments(
    receivedPaymentUpdates: {
      receivedPayments: {
        id: string;
        state: ReceivedPaymentState;
        ledgerTransferId: string;
      }[];
    }[]
  ): Promise<void>;
  storeFailedReceivedPayments(
    receivedPaymentUpdates: {
      receivedPayments: {
        id: string;
        state: ReceivedPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void>;
  storeFinalizedReceivedPayments(
    receivedPaymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      receivedPayments: { id: string; state: ReceivedPaymentState }[];
    }[]
  ): Promise<void>;
  storeCompletedLocalPayments(
    paymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      sentPayments: {
        id: string;
        state: SentPaymentState;
        sentAmount: bigint;
      }[];
    }[]
  ): Promise<void>;
  storeCancelledPayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        cancelledAt: Date;
        cancelReason?: string;
      }[];
    }[]
  ): Promise<void>;
  storeApprovedRemotePayments(
    paymentUpdates: {
      sentPayments: { id: string; state: SentPaymentState }[];
    }[]
  ): Promise<void>;
  storeSendingRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        ledgerTransferId: string;
      }[];
    }[]
  ): Promise<void>;
  storeFailedRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void>;
  storeConfirmedRemotePayments(
    paymentUpdates: {
      sentPayments: { id: string; state: SentPaymentState }[];
    }[]
  ): Promise<void>;
  storeRejectedRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void>;
  storeCompletedRemotePayments(
    paymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      sentPayments: {
        id: string;
        state: SentPaymentState;
        sentAmount: bigint;
      }[];
    }[]
  ): Promise<void>;
  storeFinalizedRemoteQuotes(
    updates: FinalizedRemoteQuoteUpdate[]
  ): Promise<void>;
}

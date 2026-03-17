import {
  InvalidPaymentIntentExpiryError,
  InvalidQuoteAmountError,
  InvalidQuoteIdError,
  PaymentIntentInvalidState
} from './errors';
import {
  IPaymentIntent,
  PaymentIntentDestination,
  PaymentIntentState,
  QuoteState
} from './interfaces';

const MAX_PAYMENT_INTENT_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const QUOTE_EXPIRY_MS = 1000 * 60 * 10;

interface Quote {
  id: string;
  state: QuoteState;
  senderWalletAddress: string;
  senderWalletAddressId: string;

  expiresAt?: Date;
  receiveAmount?: bigint;
  debitAmount?: bigint;
  exchangeRate?: number;
}

export class PaymentIntent implements IPaymentIntent {
  private _id: string;
  private _receiverWalletAddressId: string;
  private _receiverWalletAddress: string;
  private _state: PaymentIntentState;
  private _destination: PaymentIntentDestination;
  private _assetCode: string;
  private _assetScale: number;
  private _expiresAt: Date;
  private _incomingAmount: bigint | null;
  private _receivedAmount: bigint;
  private _quotes: Quote[] = [];

  private constructor(
    id: string,
    receiverWalletAddressId: string,
    receiverWalletAddress: string,
    destination: PaymentIntentDestination,
    assetCode: string,
    assetScale: number,
    expiresAt: Date,
    incomingAmount: bigint | null = null,
    receivedAmount: bigint = 0n,
    state: PaymentIntentState = PaymentIntentState.CREATED,
    quotes: Quote[] = []
  ) {
    this._id = id;
    this._receiverWalletAddressId = receiverWalletAddressId;
    this._receiverWalletAddress = receiverWalletAddress;
    this._destination = destination;
    this._assetCode = assetCode;
    this._assetScale = assetScale;

    this._incomingAmount = incomingAmount;
    this._receivedAmount = receivedAmount;
    this._state = state;
    this._quotes = quotes;

    this._expiresAt = expiresAt;
  }

  static create(
    id: string,
    receiverWalletAddressId: string,
    receiverWalletAddress: string,
    destination: PaymentIntentDestination,
    assetCode: string,
    assetScale: number,
    expiresAt: string | null,
    incomingAmount: bigint | null = null,
    receivedAmount: bigint = 0n
  ): PaymentIntent {
    const resolvedExpiresAt = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + MAX_PAYMENT_INTENT_EXPIRY_MS);

    if (resolvedExpiresAt.getTime() <= Date.now()) {
      throw new InvalidPaymentIntentExpiryError(
        'expiresAt must be in the future'
      );
    }
    if (
      resolvedExpiresAt.getTime() >
      Date.now() + MAX_PAYMENT_INTENT_EXPIRY_MS
    ) {
      throw new InvalidPaymentIntentExpiryError(
        'expiresAt must be within 30 days'
      );
    }

    return new PaymentIntent(
      id,
      receiverWalletAddressId,
      receiverWalletAddress,
      destination,
      assetCode,
      assetScale,
      resolvedExpiresAt,
      incomingAmount,
      receivedAmount
    );
  }

  static fromObject(obj: IPaymentIntent): PaymentIntent {
    return new PaymentIntent(
      obj.id,
      obj.receiverWalletAddressId,
      obj.receiverWalletAddress,
      obj.destination,
      obj.assetCode,
      obj.assetScale,
      obj.expiresAt,
      obj.incomingAmount,
      obj.receivedAmount,
      obj.state,
      obj.quotes
    );
  }

  toObject(): IPaymentIntent {
    return {
      id: this._id,
      receiverWalletAddressId: this._receiverWalletAddressId,
      receiverWalletAddress: this._receiverWalletAddress,
      state: this._state,
      destination: this._destination,
      assetCode: this._assetCode,
      assetScale: this._assetScale,
      expiresAt: this._expiresAt,
      incomingAmount: this._incomingAmount,
      receivedAmount: this._receivedAmount,
      quotes: this._quotes.map((quote) => ({
        id: quote.id,
        state: quote.state,
        senderWalletAddress: quote.senderWalletAddress,
        senderWalletAddressId: quote.senderWalletAddressId,
        debitAmount: quote.debitAmount,
        receiveAmount: quote.receiveAmount,
        expiresAt: quote.expiresAt,
        exchangeRate: quote.exchangeRate
      }))
    };
  }

  addLocalQuote(args: {
    id: string;
    receiveAmount?: bigint;
    debitAmount?: bigint;
    exchangeRate: number;
    senderWalletAddress: {
      id: string;
      address: string;
      assetCode: string;
      assetScale: number;
    };
  }): void {
    const {
      id,
      debitAmount,
      receiveAmount,
      senderWalletAddress,
      exchangeRate: unscaledExchangeRate
    } = args;

    const isValidPaymentIntentState =
      this.state === 'CREATED' || this.state === 'PARTIALLY_PAID';

    if (!isValidPaymentIntentState) {
      throw new PaymentIntentInvalidState(
        `Payment intent is in an invalid state for quoting: ${this.state}`
      );
    }

    if (this.isExpired) {
      throw new PaymentIntentInvalidState(
        `Payment intent is expired at: ${this.expiresAt.toISOString()}`
      );
    }

    if (this.quotes.find((quote) => quote.id === id)) {
      throw new InvalidQuoteIdError(
        `Duplicate quote id ${id} exist for ${this.id} payment intent`
      );
    }

    let quoteReceiveAmount: bigint;
    let quoteDebitAmount: bigint;

    const scaleDiff = this.assetScale - senderWalletAddress.assetScale;
    const exchangeRate = unscaledExchangeRate * 10 ** scaleDiff;

    if (debitAmount) {
      quoteReceiveAmount = BigInt(
        Math.floor(Number(debitAmount) * exchangeRate)
      );
      quoteDebitAmount = debitAmount;
    } else if (receiveAmount) {
      quoteDebitAmount = BigInt(
        Math.ceil(Number(receiveAmount) / exchangeRate)
      );
      quoteReceiveAmount = receiveAmount;
    } else if (this.incomingAmount) {
      quoteDebitAmount = BigInt(
        Math.ceil(Number(this.incomingAmount) / exchangeRate)
      );
      quoteReceiveAmount = this.incomingAmount;
    } else {
      throw new InvalidQuoteAmountError(
        'Quote request must have debitAmount, receiveAmount, or the payment intent must have an incomingAmount'
      );
    }

    const quoteDefaultExpiryMs = Date.now() + QUOTE_EXPIRY_MS;
    const quote: Quote = {
      id,
      debitAmount: quoteDebitAmount,
      receiveAmount: quoteReceiveAmount,
      state: 'COMPLETED',
      senderWalletAddress: senderWalletAddress.address,
      senderWalletAddressId: senderWalletAddress.id,
      expiresAt: new Date(
        Math.min(this.expiresAt.getTime(), quoteDefaultExpiryMs)
      ),
      exchangeRate
    };

    this._quotes.push(quote);
  }

  get id(): string {
    return this._id;
  }

  get receiverWalletAddressId(): string {
    return this._receiverWalletAddressId;
  }

  get receiverWalletAddress(): string {
    return this._receiverWalletAddress;
  }

  get state(): PaymentIntentState {
    return this._state;
  }

  get destination(): PaymentIntentDestination {
    return this._destination;
  }

  get assetCode(): string {
    return this._assetCode;
  }

  get assetScale(): number {
    return this._assetScale;
  }

  get expiresAt(): Date {
    return this._expiresAt;
  }

  get isExpired(): boolean {
    return this._expiresAt.getTime() < Date.now();
  }

  get incomingAmount(): bigint | null {
    return this._incomingAmount;
  }

  get receivedAmount(): bigint {
    return this._receivedAmount;
  }

  get quotes(): Quote[] {
    return this._quotes;
  }
}

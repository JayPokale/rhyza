import { IPaymentIntent, PaymentIntentState } from './interfaces';

export class PaymentIntentEntity implements IPaymentIntent {
  private _id: string;
  private _walletAddressId: string;
  private _state: PaymentIntentState;
  private _assetCode: string;
  private _assetScale: number;
  private _expiresAt: Date;
  private _incomingAmount: bigint | null;
  private _receivedAmount: bigint;

  constructor(
    id: string,
    walletAddressId: string,
    assetCode: string,
    assetScale: number,
    expiresAt: Date,
    incomingAmount: bigint | null = null,
    receivedAmount: bigint = 0n,
    state: PaymentIntentState = PaymentIntentState.CREATED
  ) {
    this._id = id;
    this._walletAddressId = walletAddressId;
    this._assetCode = assetCode;
    this._assetScale = assetScale;
    this._expiresAt = expiresAt;
    this._incomingAmount = incomingAmount;
    this._receivedAmount = receivedAmount;
    this._state = state;
  }

  static fromObject(json: IPaymentIntent): PaymentIntentEntity {
    return new PaymentIntentEntity(
      json.id,
      json.walletAddressId,
      json.assetCode,
      json.assetScale,
      json.expiresAt,
      json.incomingAmount,
      json.receivedAmount,
      json.state
    );
  }

  toObject(): IPaymentIntent {
    return {
      id: this._id,
      walletAddressId: this._walletAddressId,
      state: this._state,
      assetCode: this._assetCode,
      assetScale: this._assetScale,
      expiresAt: this._expiresAt,
      incomingAmount: this._incomingAmount,
      receivedAmount: this._receivedAmount
    };
  }

  get id(): string {
    return this._id;
  }

  get walletAddressId(): string {
    return this._walletAddressId;
  }

  get state(): PaymentIntentState {
    return this._state;
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

  get incomingAmount(): bigint | null {
    return this._incomingAmount;
  }

  get receivedAmount(): bigint {
    return this._receivedAmount;
  }
}

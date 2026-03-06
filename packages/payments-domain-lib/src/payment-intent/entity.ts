import {
  IPaymentIntent,
  PaymentIntentDestination,
  PaymentIntentState
} from './interfaces';

export class PaymentIntentEntity implements IPaymentIntent {
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

  constructor(
    id: string,
    receiverWalletAddressId: string,
    receiverWalletAddress: string,
    destination: PaymentIntentDestination,
    assetCode: string,
    assetScale: number,
    expiresAt: Date,
    incomingAmount: bigint | null = null,
    receivedAmount: bigint = 0n,
    state: PaymentIntentState = PaymentIntentState.CREATED
  ) {
    this._id = id;
    this._receiverWalletAddressId = receiverWalletAddressId;
    this._receiverWalletAddress = receiverWalletAddress;
    this._destination = destination;
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
      json.receiverWalletAddressId,
      json.receiverWalletAddress,
      json.destination,
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
      receiverWalletAddressId: this._receiverWalletAddressId,
      receiverWalletAddress: this._receiverWalletAddress,
      state: this._state,
      destination: this._destination,
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

  get incomingAmount(): bigint | null {
    return this._incomingAmount;
  }

  get receivedAmount(): bigint {
    return this._receivedAmount;
  }
}

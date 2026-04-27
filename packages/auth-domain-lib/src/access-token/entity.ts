import { IAccessToken } from './interfaces';

interface IAccessTokenInput {
  value: string;
  grantId: string;
  managementId: string;
  expiresIn: number;
  createdAt: Date;
  revokedAt?: Date;
}

export class AccessTokenEntity implements IAccessToken {
  private _value: string;
  private _grantId: string;
  private _managementId: string;
  private _expiresIn: number;
  private _revokedAt?: Date;
  private _createdAt: Date;

  private constructor(input: IAccessTokenInput) {
    this._value = input.value;
    this._grantId = input.grantId;
    this._managementId = input.managementId;
    this._expiresIn = input.expiresIn;
    this._revokedAt = input.revokedAt;
    this._createdAt = input.createdAt;
  }

  static fromObject(obj: IAccessTokenInput): AccessTokenEntity {
    return new AccessTokenEntity(obj);
  }

  toObject(): IAccessToken {
    return {
      value: this._value,
      grantId: this._grantId,
      managementId: this._managementId,
      expiresIn: this._expiresIn,
      createdAt: this._createdAt,
      revokedAt: this._revokedAt
    };
  }

  get value(): string {
    return this._value;
  }

  get grantId(): string {
    return this._grantId;
  }

  get managementId(): string {
    return this._managementId;
  }

  get expiresIn(): number {
    return this._expiresIn;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get revokedAt(): Date | undefined {
    return this._revokedAt;
  }

  revoke(revokedAt: Date = new Date()) {
    this._revokedAt = revokedAt;
  }

  isValid(): boolean {
    const expirationTime = this._createdAt.getTime() + this._expiresIn;
    const isExpired = expirationTime < Date.now();
    const isRevoked = this._revokedAt !== undefined;

    return !isExpired && !isRevoked;
  }
}

import crypto from 'node:crypto';
import {
  IPalJsonWebKeyDto,
  IPalWalletAddressKeyDto
} from 'pal-public-types-lib';
import { InvalidWalletAddressJwkError } from '../errors';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidWalletAddressJwk(jwk: IPalJsonWebKeyDto): boolean {
  return (
    typeof jwk.kid === 'string' &&
    jwk.kid.length > 0 &&
    jwk.alg === 'EdDSA' &&
    jwk.kty === 'OKP' &&
    jwk.crv === 'Ed25519' &&
    typeof jwk.x === 'string' &&
    BASE64URL_PATTERN.test(jwk.x) &&
    (jwk.use === undefined || jwk.use === 'sig')
  );
}

function copyJwk(jwk: IPalJsonWebKeyDto): IPalJsonWebKeyDto {
  return {
    kid: jwk.kid,
    alg: jwk.alg,
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    ...(jwk.use ? { use: jwk.use } : {})
  };
}

export class PalWalletAddressKey {
  private readonly _id: string;
  private readonly _walletAddressId: string;
  private readonly _jwk: IPalJsonWebKeyDto;

  private constructor(
    id: string,
    walletAddressId: string,
    jwk: IPalJsonWebKeyDto
  ) {
    this._id = id;
    this._walletAddressId = walletAddressId;
    this._jwk = jwk;
  }

  static create(
    walletAddressId: string,
    jwk: IPalJsonWebKeyDto
  ): PalWalletAddressKey {
    if (!isValidWalletAddressJwk(jwk)) {
      throw new InvalidWalletAddressJwkError(
        'JWK must be an Ed25519 public key (alg=EdDSA, kty=OKP, crv=Ed25519)'
      );
    }

    return new PalWalletAddressKey(
      crypto.randomUUID(),
      walletAddressId,
      copyJwk(jwk)
    );
  }

  static fromObject(json: IPalWalletAddressKeyDto): PalWalletAddressKey {
    return new PalWalletAddressKey(
      json.id,
      json.walletAddressId,
      copyJwk(json.jwk)
    );
  }

  toObject(): IPalWalletAddressKeyDto {
    return {
      id: this._id,
      walletAddressId: this._walletAddressId,
      jwk: copyJwk(this._jwk)
    };
  }

  get id(): string {
    return this._id;
  }

  get walletAddressId(): string {
    return this._walletAddressId;
  }

  get jwk(): IPalJsonWebKeyDto {
    return copyJwk(this._jwk);
  }
}

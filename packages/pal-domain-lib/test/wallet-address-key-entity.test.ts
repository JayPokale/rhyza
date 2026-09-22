import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { IPalJsonWebKeyDto } from 'pal-public-types-lib';
import { InvalidWalletAddressJwkError, PalWalletAddressKey } from '../src';

const VALID_JWK: IPalJsonWebKeyDto = {
  kid: 'key-1',
  alg: 'EdDSA',
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
};

test('PalWalletAddressKey.create stores a valid Ed25519 JWK', () => {
  const key = PalWalletAddressKey.create('wallet-1', VALID_JWK);
  const obj = key.toObject();

  assert.ok(obj.id);
  assert.equal(obj.walletAddressId, 'wallet-1');
  assert.equal(obj.jwk.kid, VALID_JWK.kid);
  assert.equal(obj.jwk.alg, 'EdDSA');
  assert.equal(obj.jwk.kty, 'OKP');
  assert.equal(obj.jwk.crv, 'Ed25519');
  assert.equal(obj.jwk.x, VALID_JWK.x);
  assert.equal(obj.jwk.use, undefined);
});

test('PalWalletAddressKey.create rejects a non-Ed25519 JWK', () => {
  assert.throws(
    () =>
      PalWalletAddressKey.create('wallet-1', {
        ...VALID_JWK,
        alg: 'RS256'
      }),
    InvalidWalletAddressJwkError
  );
});

test('PalWalletAddressKey.fromObject rehydrates stored state', () => {
  const created = PalWalletAddressKey.create('wallet-1', {
    ...VALID_JWK,
    use: 'sig'
  });
  const rehydrated = PalWalletAddressKey.fromObject(created.toObject());

  assert.deepEqual(rehydrated.toObject(), created.toObject());
});

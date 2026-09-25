import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { IPalJsonWebKeyDto } from 'pal-public-types-lib';
import {
  DuplicateWalletAddressKeyError,
  InvalidWalletAddressJwkError,
  PalWalletAddress,
  PalWalletAddressKey,
  WalletAddressKeyAlreadyRevokedError
} from '../src';

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
  assert.equal(obj.revoked, false);
  assert.equal(obj.revokedAt, undefined);
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

test('PalWalletAddressKey.revoke stamps revokedAt once', () => {
  const key = PalWalletAddressKey.create('wallet-1', VALID_JWK);
  const revokedAt = key.revoke();

  assert.ok(revokedAt instanceof Date);
  assert.equal(key.revoked, true);
  assert.equal(key.revokedAt, revokedAt);

  assert.throws(() => key.revoke(), WalletAddressKeyAlreadyRevokedError);
  assert.equal(key.revokedAt, revokedAt);
});

test('PalWalletAddressKey.fromObject keeps an existing revocation', () => {
  const revokedAt = new Date('2026-09-22T12:00:00.000Z');
  const created = PalWalletAddressKey.create('wallet-1', VALID_JWK);
  const stored = created.toObject();
  stored.revoked = true;
  stored.revokedAt = revokedAt;

  const rehydrated = PalWalletAddressKey.fromObject(stored);
  assert.throws(() => rehydrated.revoke(), WalletAddressKeyAlreadyRevokedError);
  assert.equal(rehydrated.revoked, true);
  assert.equal(rehydrated.revokedAt?.getTime(), revokedAt.getTime());
});

test('PalWalletAddress.addKey stores the key on the wallet', () => {
  const wallet = new PalWalletAddress('wallet-1', 'Sarah', 'USD', 2);
  const key = wallet.addKey(VALID_JWK);

  assert.equal(wallet.keys.length, 1);
  assert.equal(wallet.keys[0].id, key.id);
  assert.equal(key.walletAddressId, wallet.id);
  assert.equal(key.jwk.kid, VALID_JWK.kid);
});

test('PalWalletAddress.addKey rejects a duplicate kid', () => {
  const wallet = new PalWalletAddress('wallet-1', 'Sarah', 'USD', 2);
  wallet.addKey(VALID_JWK);

  assert.throws(() => wallet.addKey(VALID_JWK), DuplicateWalletAddressKeyError);
});

test('PalWalletAddress.toDto does not embed keys', () => {
  const wallet = new PalWalletAddress('wallet-1', 'Sarah', 'USD', 2);
  wallet.addKey(VALID_JWK);

  assert.equal('keys' in wallet.toDto(), false);
  assert.equal(wallet.keys.length, 1);
});

test('PalWalletAddress.fromDto hydrates keys', () => {
  const key = PalWalletAddressKey.create('wallet-1', VALID_JWK);
  const wallet = PalWalletAddress.fromDto({
    id: 'wallet-1',
    publicName: 'Sarah',
    assetCode: 'USD',
    assetScale: 2,
    isActive: true,
    aliases: [],
    keys: [key.toObject()]
  });

  assert.equal(wallet.keys.length, 1);
  assert.equal(wallet.keys[0].id, key.id);
  assert.equal(wallet.keys[0].jwk.kid, VALID_JWK.kid);
});

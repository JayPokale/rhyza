import { before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ConsoleLogger } from 'common-types-lib';
import { IPalJsonWebKeyDto } from 'pal-public-types-lib';
import {
  DuplicateWalletAddressKeyError,
  InvalidWalletAddressJwkError,
  IPalWalletAddressKeyRepository,
  IPalWalletAddressRepository,
  WalletAddressKeyService,
  WalletAddressNotFoundError
} from '../src';
import { MockWalletRepo } from './mocks';
import { MockWalletAddressKeyRepo } from './mocks/mock-wallet-address-key-repo';

const logger = new ConsoleLogger();

const VALID_JWK: IPalJsonWebKeyDto = {
  kid: 'key-1',
  alg: 'EdDSA',
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo'
};

let walletRepo: IPalWalletAddressRepository;
let keyRepo: IPalWalletAddressKeyRepository;
let keyService: WalletAddressKeyService;
let walletId: string;

before(async () => {
  walletRepo = new MockWalletRepo();
  keyRepo = new MockWalletAddressKeyRepo();
  keyService = new WalletAddressKeyService(keyRepo, walletRepo, logger);

  walletId = 'wallet-1';
  await walletRepo.store({
    id: walletId,
    publicName: 'Sarah',
    assetCode: 'USD',
    assetScale: 2,
    isActive: true,
    aliases: [{ domain: 'example.com', pathName: 'sarah', walletId: walletId }]
  });
});

test('PAL WalletAddress Keys - add key for existing wallet', async () => {
  const keyId = await keyService.addKey(walletId, VALID_JWK);

  assert.ok(keyId);
  const keys = await keyService.getKeys(walletId);
  assert.equal(keys.length, 1);
  assert.equal(keys[0].id, keyId);
  assert.equal(keys[0].walletAddressId, walletId);
  assert.equal(keys[0].jwk.kid, VALID_JWK.kid);
  assert.equal(keys[0].jwk.x, VALID_JWK.x);
});

test('PAL WalletAddress Keys - add key for missing wallet should fail', async () => {
  await assert.rejects(
    () => keyService.addKey('missing-wallet', VALID_JWK),
    WalletAddressNotFoundError
  );
});

test('PAL WalletAddress Keys - reject invalid jwk', async () => {
  await assert.rejects(
    () =>
      keyService.addKey(walletId, {
        ...VALID_JWK,
        alg: 'RS256'
      }),
    InvalidWalletAddressJwkError
  );
});

test('PAL WalletAddress Keys - reject duplicate kid on same wallet', async () => {
  await assert.rejects(
    () => keyService.addKey(walletId, VALID_JWK),
    DuplicateWalletAddressKeyError
  );
});

test('PAL WalletAddress Keys - allow a second kid on the same wallet', async () => {
  const keyId = await keyService.addKey(walletId, {
    ...VALID_JWK,
    kid: 'key-2'
  });

  assert.ok(keyId);
  const keys = await keyService.getKeys(walletId);
  assert.equal(keys.length, 2);
});

test('PAL WalletAddress Keys - get keys for wallet with none returns empty list', async () => {
  const otherWalletId = 'wallet-empty';
  await walletRepo.store({
    id: otherWalletId,
    publicName: 'Empty',
    assetCode: 'USD',
    assetScale: 2,
    isActive: true,
    aliases: []
  });

  const keys = await keyService.getKeys(otherWalletId);
  assert.equal(keys.length, 0);
});

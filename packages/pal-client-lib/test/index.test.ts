/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { PalClient } from '../src';

let client: PalClient;

const ASSET_CODE = 'EUR';
const ASSET_SCALE = 2;

let createdWalletAddress: string;

before(async () => {
  client = new PalClient('0.0.0.0:50051');
  await client.init();
});

/*
 * Asset tests
 * */

test('pal client - create asset', async () => {
  await client.createAsset(ASSET_CODE, ASSET_SCALE, undefined, undefined);
});

test('pal client - get asset', async () => {
  const asset = await client.getAsset(ASSET_CODE);

  assert.ok(asset);
  assert.equal(asset.code, ASSET_CODE);
  assert.equal(asset.scale, ASSET_SCALE);
  assert.equal(asset.liquidityLowThreshold, null);
  assert.equal(asset.liquidityHighThreshold, null);
});

test('pal client - created duplicate asset should fail', async () => {
  try {
    await client.createAsset(ASSET_CODE, ASSET_SCALE, undefined, undefined);

    assert.fail();
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(e.message.includes('already exists'));
  }
});

test('pal client - get non existing asset should fail', async () => {
  const asset = await client.getAsset('NON EXISTING');

  assert.ok(asset === null);
});

/*
 * Wallet address tests
 * */

test('pal client - create wallet address', async () => {
  const createdWallet = await client.createWalletAddress(
    'pedrobarreto',
    'Pedro Barreto',
    ASSET_CODE
  );

  assert.ok(createdWallet);
  assert.equal(createdWallet.address, 'pedrobarreto');
  assert.equal(createdWallet.publicName, 'Pedro Barreto');
  assert.equal(createdWallet.assetCode, ASSET_CODE);
  assert.equal(createdWallet.assetScale, ASSET_SCALE);
  assert.equal(createdWallet.isActive, true);

  createdWalletAddress = createdWallet.address;
});

test('pal client - get wallet', async () => {
  const walletAddress = await client.getWalletAddress(createdWalletAddress);

  assert.ok(walletAddress);
  assert.equal(walletAddress.address, 'pedrobarreto');
  assert.equal(walletAddress.publicName, 'Pedro Barreto');
  assert.equal(walletAddress.assetCode, ASSET_CODE);
  assert.equal(walletAddress.assetScale, ASSET_SCALE);
  assert.equal(walletAddress.isActive, true);
});

test('pal client - created duplicate wallet should fail', async () => {
  try {
    await client.createWalletAddress(
      'pedrobarreto',
      'Pedro Barreto',
      ASSET_CODE
    );

    assert.fail();
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(e.message.includes('already exists'));
  }
});

test('pal client - get non existing wallet should fail', async () => {
  const walletAddress = await client.getWalletAddress('NON EXISTING');

  assert.ok(walletAddress === null);
});

after(async () => {
  await client.disconnect();
});

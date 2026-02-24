/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';
import { before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  AssetAggregate,
  IPalAssetRepository,
  IPalWalletAddressRepository,
  WalletAddressAggregate
} from '../src';
import { MockAssetRepo, MockWalletRepo } from './mocks';

let assetAggregate: AssetAggregate;
let assetRepository: IPalAssetRepository;

let walletAggregate: WalletAddressAggregate;
let walletRepository: IPalWalletAddressRepository;

const ASSET_CODE = 'EUR';
const ASSET_SCALE = 2;

let createdWalletAddress: string;

before(async () => {
  assetRepository = new MockAssetRepo();
  assetAggregate = new AssetAggregate(assetRepository);

  walletRepository = new MockWalletRepo();
  walletAggregate = new WalletAddressAggregate(walletRepository);
});

test('pal domain - create asset', async () => {
  await assetAggregate.createAsset(
    ASSET_CODE,
    ASSET_SCALE,
    undefined,
    undefined
  );
});

test('pal domain - get asset', async () => {
  const asset = await assetAggregate.getAsset(ASSET_CODE);

  assert.ok(asset);
  assert.equal(asset.code, ASSET_CODE);
  assert.equal(asset.scale, ASSET_SCALE);
  assert.equal(asset.liquidityLowThreshold, null);
  assert.equal(asset.liquidityHighThreshold, null);
});

test('pal domain - created duplicate asset should fail', async () => {
  try {
    await assetAggregate.createAsset(
      ASSET_CODE,
      ASSET_SCALE,
      undefined,
      undefined
    );

    assert.fail();
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(e.message.includes('already exists'));
  }
});

test('pal domain - get non existing asset should fail', async () => {
  const asset = await assetAggregate.getAsset('NON EXISTING');

  assert.ok(asset === null);
});

test('pal domain - create wallet address', async () => {
  const resp = await walletAggregate.createWalletAddress(
    'pedrobarreto',
    'Pedro Barreto',
    ASSET_CODE,
    ASSET_SCALE
  );
  assert.ok(resp);

  createdWalletAddress = resp;
});

test('pal domain - get wallet', async () => {
  const asset = await walletAggregate.getWalletAddress(createdWalletAddress);

  assert.ok(asset);
  assert.equal(asset.address, 'pedrobarreto');
  assert.equal(asset.publicName, 'Pedro Barreto');
  assert.equal(asset.assetCode, ASSET_CODE);
  assert.equal(asset.assetScale, ASSET_SCALE);
  assert.equal(asset.isActive, true);
});

test('pal domain - created duplicate wallet should fail', async () => {
  try {
    await walletAggregate.createWalletAddress(
      'pedrobarreto',
      'Pedro Barreto',
      ASSET_CODE,
      ASSET_SCALE
    );

    assert.fail();
  } catch (e) {
    assert.ok(e instanceof Error);
    assert.ok(e.message.includes('already exists'));
  }
});

test('pal domain - get non existing wallet should fail', async () => {
  const asset = await walletAggregate.getWalletAddress('NON EXISTING');

  assert.ok(asset === null);
});

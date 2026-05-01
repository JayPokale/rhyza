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
import {
  PalClient,
  PalClientLedgerAccountAlreadyExistsError,
  PalClientLedgerAccountCreationFailedError, PalClientLedgerAlreadyExistsError,
  PalClientLedgerNotFoundError, parseAddressToDomainAndPathName
} from '../src';
import {randomBytes} from "node:crypto";

let client: PalClient;

const testPrefix = `TEST-${randomBytes(3).toString('hex')}`;

const assetCode = `${testPrefix}_EUR`;
// const assetCode = `CODE_${randomBytes(3).toString('hex')}`;
const assetScale = 2;
const accOneId = `${testPrefix}_acc1`;
const accTwoId = `${testPrefix}_acc2`;

before(async () => {
  client = new PalClient('0.0.0.0:50051');
  await client.init();
});
after(async () => {
  await client.disconnect();
});

/*
 * pal client ledger low-level tests
 * */

test('pal client - ledger low-level - create ledger', async () => {
    await client.createLedger(assetCode);

    assert.ok(true);
});


test('pal client - ledger low-level - create ledger for same asset should fail', async () => {
  try {
    await client.createLedger(assetCode);
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof PalClientLedgerAlreadyExistsError);
  }
});


test('pal client - ledger low-level - create ledger accounts', async () => {
  await client.createLedgerAccount(accOneId, assetCode, assetScale, accOneId.toString());
  await client.createLedgerAccount(accTwoId, assetCode, assetScale, accTwoId.toString());

  assert.ok(true);
});

test('pal client - ledger low-level - create duplicate ledger account should fail', async () => {
  try {
    await client.createLedgerAccount(accOneId, assetCode, assetScale, accOneId.toString());
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof PalClientLedgerAccountAlreadyExistsError);
  }
});

test('pal client - ledger low-level - create ledger account for non-existent asset code should fail', async () => {
  try {
    await client.createLedgerAccount(accOneId+"_other", "non-existent_asset_code", assetScale, accOneId.toString());
    assert.fail();
  } catch (e) {
    assert.ok(e instanceof PalClientLedgerNotFoundError);
  }
});

test('pal client - ledger low-level - created ledger accounts should exist and be successfully retrieved', async () => {
  const [accOne, accTwo] = await client.getLedgerAccounts([accOneId, accTwoId]);

  assert.ok(accOne);
  assert.ok(accTwo);
  assert.equal(accOne.id, accOneId);
  assert.equal(accTwo.id, accTwoId);

});

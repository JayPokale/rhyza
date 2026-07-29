import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import {amountFromBigIntOfSize, amountToBigIntOfSize} from "../src/liquidity/utils";
import { LedgerPrecisionLossError } from "../src/liquidity/errors";

test('PAL Ledger - amount conversion - from string to bigint', async () => {

  let resp = amountToBigIntOfSize("123", 2, 2);
  assert.equal(resp, 123n);
  resp = amountToBigIntOfSize("-123", 2, 2);
  assert.equal(resp, -123n);

  resp = amountToBigIntOfSize("123", 2, 4);
  assert.equal(resp, 12300n);
  resp = amountToBigIntOfSize("-123", 2, 4);
  assert.equal(resp, -12300n);


  try{
    assert.equal(amountToBigIntOfSize("123", 4, 2), 12300n);
    assert.fail();
  }catch (e){
    assert.ok(e instanceof LedgerPrecisionLossError);
  }

  try{
    resp = amountToBigIntOfSize("123", 4, 4);
    assert.equal(resp, 12300n);
    assert.fail();
  }catch (e){
    assert.ok(e instanceof LedgerPrecisionLossError);
  }

  try{
    assert.equal(amountToBigIntOfSize("12.34", 2, 2), 123n);
    assert.fail();
  }catch (e){
    assert.ok(e instanceof Error);
  }

  try{
    assert.equal(amountToBigIntOfSize("a123", 2, 2), 123n);
    assert.fail();
  }catch (e){
    assert.ok(e instanceof Error);
  }
});


test('PAL Ledger - amount conversion - from bigint to string', async () => {

  assert.equal(amountFromBigIntOfSize(123n, 2, 2), "123");
  assert.equal(amountFromBigIntOfSize(-123n, 2, 2), "-123");

  assert.equal(amountFromBigIntOfSize(12300n, 4, 2), "123");
  assert.equal(amountFromBigIntOfSize(-12300n, 4, 2), "-123");

  //
  // try{
  //   assert.equal(amountFromBigIntOfSize("1.23", 4, 2), 12300n);
  //   assert.fail();
  // }catch (e){
  //   assert.ok(e instanceof LedgerPrecisionLossError);
  // }
  //
  // try{
  //   assert.equal(amountFromBigIntOfSize("a1.23", 2, 2), 123n);
  //   assert.fail();
  // }catch (e){
  //   assert.ok(e instanceof Error);
  // }
});

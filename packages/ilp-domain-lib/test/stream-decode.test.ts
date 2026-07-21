'use strict';

import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  decodeInboundStreamPrepare,
  encryptStreamData,
  ENCRYPTION_KEY_STRING,
  FULFILLMENT_GENERATION_STRING,
  hmacSha256,
  sha256
} from '../src/stream/decode.js';

describe('STREAM inbound decode', () => {
  test('marks a prepare fulfillable when condition matches STREAM fulfillment', () => {
    const sharedSecret = randomBytes(32);
    const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
    const plaintext = Buffer.from('stream-money-frame');
    const data = encryptStreamData(encryptionKey, plaintext);
    const fulfillmentKey = hmacSha256(
      sharedSecret,
      FULFILLMENT_GENERATION_STRING
    );
    const fulfillment = hmacSha256(fulfillmentKey, data);
    const executionCondition = sha256(fulfillment);

    const result = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition,
      data
    });

    assert.equal(result.fulfillable, true);
    assert.ok(result.fulfillment);
    assert.ok(result.fulfillment!.equals(fulfillment));
    assert.ok(result.plaintext);
    assert.ok(result.plaintext!.equals(plaintext));
  });

  test('marks a prepare not fulfillable when condition is random (quote probe)', () => {
    const sharedSecret = randomBytes(32);
    const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
    const data = encryptStreamData(
      encryptionKey,
      Buffer.from('quote-probe-frames')
    );
    const executionCondition = randomBytes(32);

    const result = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition,
      data
    });

    assert.equal(result.fulfillable, false);
    assert.equal(result.fulfillment, undefined);
    assert.ok(result.plaintext);
  });

  test('treats undecryptable data as not fulfillable without throwing', () => {
    const result = decodeInboundStreamPrepare({
      sharedSecret: randomBytes(32),
      executionCondition: randomBytes(32),
      data: Buffer.from('not-stream-ciphertext')
    });

    assert.equal(result.fulfillable, false);
    assert.equal(result.plaintext, undefined);
    assert.equal(result.fulfillment, undefined);
  });

  test('encryptStreamData round-trips through decode decrypt path', () => {
    const sharedSecret = randomBytes(32);
    const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
    const plaintext = Buffer.from('hello-stream');
    const data = encryptStreamData(encryptionKey, plaintext);
    const fulfillmentKey = hmacSha256(
      sharedSecret,
      FULFILLMENT_GENERATION_STRING
    );
    const fulfillment = hmacSha256(fulfillmentKey, data);
    const executionCondition = sha256(fulfillment);

    const result = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition,
      data
    });

    assert.equal(result.fulfillable, true);
    assert.ok(result.plaintext!.equals(plaintext));
  });
});

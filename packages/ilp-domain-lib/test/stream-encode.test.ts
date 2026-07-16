'use strict';

import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  Packet,
  StreamMoneyFrame
} from 'ilp-protocol-stream/dist/src/packet.js';
import {
  decodeInboundStreamPrepare,
  ENCRYPTION_KEY_STRING,
  hmacSha256
} from '../src/stream/decode.js';
import { encodeOutgoingStreamPrepare } from '../src/stream/encode.js';

describe('STREAM outgoing encode', () => {
  test('produces a fulfillable condition that round-trips through decode', () => {
    const sharedSecret = randomBytes(32);
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret,
      amount: '100'
    });

    assert.equal(encoded.executionCondition.length, 32);
    assert.equal(encoded.fulfillment.length, 32);
    assert.ok(encoded.data.length > 0);

    const decoded = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition: encoded.executionCondition,
      data: encoded.data
    });

    assert.equal(decoded.fulfillable, true);
    assert.ok(decoded.fulfillment);
    assert.ok(decoded.fulfillment!.equals(encoded.fulfillment));
    assert.ok(decoded.plaintext);
  });

  test('encrypt/decrypt yields a STREAM packet with StreamMoney for the amount', () => {
    const sharedSecret = randomBytes(32);
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret,
      amount: '250',
      sequence: 7
    });

    const decrypted = decodeInboundStreamPrepare({
      sharedSecret,
      executionCondition: encoded.executionCondition,
      data: encoded.data
    });
    assert.ok(decrypted.plaintext);

    const streamPacket = Packet._deserializeUnencrypted(decrypted.plaintext!);
    assert.equal(streamPacket.sequence.toString(), '7');
    assert.equal(streamPacket.prepareAmount.toString(), '250');
    assert.equal(streamPacket.frames.length, 1);
    assert.ok(streamPacket.frames[0] instanceof StreamMoneyFrame);
    assert.equal(
      (streamPacket.frames[0] as StreamMoneyFrame).streamId.toString(),
      '1'
    );

    const encryptionKey = hmacSha256(sharedSecret, ENCRYPTION_KEY_STRING);
    assert.equal(encryptionKey.length, 32);
  });

  test('each encode uses fresh ciphertext so conditions differ', () => {
    const sharedSecret = Buffer.alloc(32, 3);
    const a = encodeOutgoingStreamPrepare({ sharedSecret, amount: '42' });
    const b = encodeOutgoingStreamPrepare({ sharedSecret, amount: '42' });

    // Nonce in encrypt makes ciphertext (and thus condition) differ.
    assert.notEqual(a.data.toString('base64'), b.data.toString('base64'));
    assert.notEqual(
      a.executionCondition.toString('base64'),
      b.executionCondition.toString('base64')
    );

    for (const encoded of [a, b]) {
      assert.equal(
        decodeInboundStreamPrepare({
          sharedSecret,
          executionCondition: encoded.executionCondition,
          data: encoded.data
        }).fulfillable,
        true
      );
    }
  });
});

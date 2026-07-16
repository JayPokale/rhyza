'use strict';

import {
  decrypt,
  encrypt,
  hmac,
  sha256
} from '@interledger/stream-receiver/dist/src/utils.js';

// Same key-derivation labels StreamServer uses internally.
export const FULFILLMENT_GENERATION_STRING = Buffer.from(
  'ilp_stream_fulfillment'
);
export const ENCRYPTION_KEY_STRING = Buffer.from('ilp_stream_encryption');

export { hmac as hmacSha256, sha256, encrypt as encryptStreamData };

export interface StreamDecodeInput {
  sharedSecret: Buffer;
  executionCondition: Buffer;
  data: Buffer;
}

export interface StreamDecodeResult {
  fulfillable: boolean;
  fulfillment?: Buffer;
  plaintext?: Buffer;
}


export function decodeInboundStreamPrepare(
  input: StreamDecodeInput
): StreamDecodeResult {
  const encryptionKey = hmac(input.sharedSecret, ENCRYPTION_KEY_STRING);
  let plaintext: Buffer | undefined;
  try {
    plaintext = decrypt(encryptionKey, input.data);
  } catch {
    plaintext = undefined;
  }

  const fulfillmentKey = hmac(
    input.sharedSecret,
    FULFILLMENT_GENERATION_STRING
  );
  const fulfillment = hmac(fulfillmentKey, input.data);
  const fulfillable = sha256(fulfillment).equals(input.executionCondition);

  if (fulfillable) {
    return { fulfillable: true, fulfillment, plaintext };
  }

  return { fulfillable: false, plaintext };
}

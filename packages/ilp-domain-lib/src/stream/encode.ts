'use strict';

import {
  IlpPacketType,
  Packet,
  StreamMoneyFrame
} from 'ilp-protocol-stream/dist/src/packet.js';
import {
  ENCRYPTION_KEY_STRING,
  FULFILLMENT_GENERATION_STRING,
  encryptStreamData,
  hmacSha256,
  sha256
} from './decode.js';

/** Client-initiated stream id (odd). Single stream for the minimal sender. */
const DEFAULT_STREAM_ID = 1;
/** All ILP prepare amount attributed to that one stream. */
const DEFAULT_STREAM_SHARES = 1;
const DEFAULT_SEQUENCE = 1;

export interface StreamEncodeInput {
  sharedSecret: Buffer;
  /** Min destination amount carried in the STREAM prepareAmount field. */
  amount: string;
  sequence?: number;
}

export interface StreamEncodeResult {
  /** Encrypted STREAM packet bytes for the ILP Prepare `data` field. */
  data: Buffer;
  executionCondition: Buffer;
  fulfillment: Buffer;
}

/**
 * Minimal fulfillable STREAM encode: one stream, one StreamMoney frame, no
 * flow-control frames. Condition = SHA-256(HMAC(fulfillmentKey, data)).
 */
export function encodeOutgoingStreamPrepare(
  input: StreamEncodeInput
): StreamEncodeResult {
  const encryptionKey = hmacSha256(input.sharedSecret, ENCRYPTION_KEY_STRING);
  const streamPacket = new Packet(
    input.sequence ?? DEFAULT_SEQUENCE,
    IlpPacketType.Prepare,
    input.amount,
    [new StreamMoneyFrame(DEFAULT_STREAM_ID, DEFAULT_STREAM_SHARES)]
  );
  const data = encryptStreamData(encryptionKey, streamPacket._serialize());

  const fulfillmentKey = hmacSha256(
    input.sharedSecret,
    FULFILLMENT_GENERATION_STRING
  );
  const fulfillment = hmacSha256(fulfillmentKey, data);
  const executionCondition = sha256(fulfillment);

  return { data, executionCondition, fulfillment };
}

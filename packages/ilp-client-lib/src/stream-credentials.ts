'use strict';

import { StreamServer } from '@interledger/stream-receiver';

export interface GenerateStreamCredentialsArgs {
  paymentIntentId: string;
  assetCode: string;
  assetScale: number;
}

export interface StreamCredentialsResult {
  ilpAddress: string;
  sharedSecret: string;
}

export function createStreamServer(options: {
  serverSecret: Buffer;
  serverAddress: string;
}): StreamServer {
  return new StreamServer(options);
}

export function generateStreamCredentials(
  streamServer: StreamServer,
  args: GenerateStreamCredentialsArgs
): StreamCredentialsResult {
  const credentials = streamServer.generateCredentials({
    paymentTag: args.paymentIntentId,
    asset: {
      code: args.assetCode,
      scale: args.assetScale
    }
  });

  return {
    ilpAddress: credentials.ilpAddress,
    sharedSecret: credentials.sharedSecret.toString('base64url')
  };
}

export function parseStreamServerSecret(raw: string): Buffer {
  const secret = Buffer.from(raw, 'base64url');
  if (secret.byteLength !== 32) {
    throw new Error(
      `STREAM_SERVER_SECRET must decode to 32 bytes (got ${secret.byteLength})`
    );
  }
  return secret;
}

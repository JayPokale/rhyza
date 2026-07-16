'use strict';

import {
  IRemotePaymentIntentService,
  IRemotePaymentIntentDetails
} from 'payments-domain-lib';

const STUB_DESTINATION_ILP_PREFIX = 'g.rafiki';

// TODO: Consider replacing fetch with the open-payments-node client.
// That would require either: (a) key pair initialization for authenticated
// requests, or (b) the remote server exposing asset details on the public
// incoming payment endpoint (e.g., excluding only receiver wallet address).
// Ideally we shouldn't need to make an authenticated request for this.
export class RemotePaymentIntentAdapter implements IRemotePaymentIntentService {
  async fetchIncomingPayment(
    url: string
  ): Promise<IRemotePaymentIntentDetails> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch remote incoming payment at ${url}: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      walletAddress: string;
      incomingAmount?: { value: string; assetCode: string; assetScale: number };
      receivedAmount: { value: string; assetCode: string; assetScale: number };
      expiresAt?: string;
      destinationIlpAddress?: string;
      sharedSecret?: string;
    };

    if (!data.sharedSecret) {
      throw new Error(
        `Remote incoming payment ${url} response missing sharedSecret`
      );
    }

    // Until STREAM is wired, fabricate a dynamic <prefix>.<suffix> destination
    // (real STREAM supplies data.destinationIlpAddress). The response carries no
    // id of its own, so use the remote incoming-payment id from the URL as the
    // suffix — the aggregate strips it back off to resolve the peer by prefix.
    const incomingPaymentId =
      new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'stub';
    const stubDestinationIlpAddress = `${STUB_DESTINATION_ILP_PREFIX}.${incomingPaymentId}`;

    return {
      walletAddress: data.walletAddress,
      assetCode: data.receivedAmount.assetCode,
      assetScale: data.receivedAmount.assetScale,
      incomingAmount: data.incomingAmount
        ? BigInt(data.incomingAmount.value)
        : undefined,
      receivedAmount: BigInt(data.receivedAmount.value),
      expiresAt: data.expiresAt,
      destinationIlpAddress:
        data.destinationIlpAddress ?? stubDestinationIlpAddress,
      sharedSecret: data.sharedSecret
    };
  }
}

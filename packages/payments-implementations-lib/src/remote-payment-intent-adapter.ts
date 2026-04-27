'use strict';

import {
  IRemotePaymentIntentPort,
  RemotePaymentIntentDetails
} from 'payments-domain-lib';

// TODO: Consider replacing with the open-payments-node client.
// That would require either: (a) key pair initialization for authenticated
// requests, or (b) the remote server exposing asset details on the public
// incoming payment endpoint (e.g., excluding only receiver wallet address).
// Ideally we shouldn't need to make an authenticated request for this.
export class RemotePaymentIntentAdapter implements IRemotePaymentIntentPort {
  async fetchIncomingPayment(url: string): Promise<RemotePaymentIntentDetails> {
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
      receivedAmount?: { value: string; assetCode: string; assetScale: number };
      expiresAt?: string;
    };

    // Asset is always available on receivedAmount when incomingAmount is absent.
    const amountWithAsset = data.incomingAmount ?? data.receivedAmount;
    if (!amountWithAsset) {
      throw new Error(
        `Remote incoming payment at ${url} did not include asset details`
      );
    }

    return {
      walletAddress: data.walletAddress,
      assetCode: amountWithAsset.assetCode,
      assetScale: amountWithAsset.assetScale,
      incomingAmount: data.incomingAmount
        ? BigInt(data.incomingAmount.value)
        : undefined,
      expiresAt: data.expiresAt
    };
  }
}

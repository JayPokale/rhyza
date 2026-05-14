'use strict';

import {
  IRemotePaymentIntentService,
  IRemotePaymentIntentDetails
} from 'payments-domain-lib';

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
      assetCode: string;
      assetScale: number;
      incomingAmount?: { value: string; assetCode: string; assetScale: number };
      receivedAmount: { value: string; assetCode: string; assetScale: number };
      expiresAt?: string;
      destinationIlpAddress?: string;
    };

    if (!data.destinationIlpAddress) {
      throw new Error(
        `Remote incoming payment at ${url} did not include destinationIlpAddress`
      );
    }

    return {
      walletAddress: data.walletAddress,
      assetCode: data.assetCode,
      assetScale: data.assetScale,
      incomingAmount: data.incomingAmount
        ? BigInt(data.incomingAmount.value)
        : undefined,
      receivedAmount: BigInt(data.receivedAmount.value),
      expiresAt: data.expiresAt,
      destinationIlpAddress: data.destinationIlpAddress
    };
  }
}

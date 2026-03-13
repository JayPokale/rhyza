'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

function parseWalletAddress(address: string): {
  prefix: string | null;
  suffix: string;
} {
  const lastIndex = address.lastIndexOf('/');
  if (lastIndex >= 0) {
    return {
      prefix: address.substring(0, lastIndex),
      suffix: address.substring(lastIndex + 1)
    };
  }
  return { prefix: null, suffix: address };
}

export async function quoteRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: {
      walletAddress: string;
      id?: string;
      incomingPaymentId: string;
      debitAmount?: string;
      receiveAmount?: string;
    };
  }>('/quotes', async (request, reply) => {
    const { incomingPaymentId, walletAddress, debitAmount, receiveAmount } =
      request.body;

    const id = request.body.id ?? randomUUID();

    const { prefix, suffix } = parseWalletAddress(walletAddress);
    const alias = await palClient.ResolveWalletAddressAlias(prefix, suffix);
    if (!alias) {
      return reply
        .status(404)
        .send({ error: `Wallet address '${walletAddress}' not found` });
    }

    const result = await paymentsClient.createQuote(
      id,
      incomingPaymentId,
      alias.walletAddressId,
      walletAddress,
      Number(debitAmount),
      Number(receiveAmount)
    );

    return reply.status(201).send({ id: `${result.id}_${incomingPaymentId}` }); // Concatenate ids when returning the request
  });
}

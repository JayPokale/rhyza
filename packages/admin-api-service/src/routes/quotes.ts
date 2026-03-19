'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
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

    const { domain, pathName } = parseAddressToDomainAndPathName(walletAddress);
    const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);
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

'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

export async function incomingPaymentRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: {
      walletAddress: string;
      id?: string;
      incomingAmount?: number;
      expiresAt?: string;
      metadata?: string;
    };
  }>('/incoming-payments', async (request, reply) => {
    const { walletAddress, incomingAmount, expiresAt, metadata } = request.body;

    const id = request.body.id ?? randomUUID();

    const { domain, pathName } = parseAddressToDomainAndPathName(walletAddress);

    const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);

    if (!alias) {
      return reply
        .status(404)
        .send({ error: `Wallet address '${walletAddress}' not found` });
    }

    const result = await paymentsClient.createIncomingPayment(
      id,
      alias.walletAddressId,
      walletAddress,
      incomingAmount ? Number(incomingAmount) : undefined,
      expiresAt,
      metadata
    );

    return reply.status(201).send({ id: result.id });
  });
}

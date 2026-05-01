'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

interface OutgoingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

export async function outgoingPaymentRoutes(
  server: FastifyInstance,
  opts: OutgoingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: {
      walletAddress: string;
      id?: string;
      quoteId?: string;
      incomingPaymentId?: string;
      debitAmount?: number;
    };
  }>('/outgoing-payments', async (request, reply) => {
    const { walletAddress, debitAmount } = request.body;

    const id = request.body.id ?? randomUUID();

    let quoteId: string | undefined;
    let incomingPaymentId: string;

    if (request.body.quoteId) {
      if (!request.body.quoteId.includes('_')) {
        return reply.status(400).send({
          error: 'Invalid quoteId provided'
        });
      }

      [incomingPaymentId, quoteId] = request.body.quoteId.split('_');
    } else if (request.body.incomingPaymentId) {
      incomingPaymentId = request.body.incomingPaymentId;
    } else {
      return reply.status(400).send({
        error: 'Either quoteId or incomingPaymentId must be provided'
      });
    }

    const { domain, pathName } = parseAddressToDomainAndPathName(walletAddress);
    const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);
    if (!alias) {
      return reply
        .status(404)
        .send({ error: `Wallet address '${walletAddress}' not found` });
    }

    const result = await paymentsClient.createOutgoingPayment(
      id,
      alias.walletAddressId,
      walletAddress,
      incomingPaymentId,
      quoteId,
      debitAmount ? Number(debitAmount) : undefined
    );

    return reply.status(201).send({ id: `${incomingPaymentId}_${result.id}` });
  });

  server.post<{
    Params: {
      id: string;
    };
  }>('/outgoing-payments/:id/approve', async (request, reply) => {
    if (!request.params.id.includes('_')) {
      return reply.status(400).send({
        error: 'Invalid id provided'
      });
    }

    const [incomingPaymentId, id] = request.params.id.split('_');

    try {
      await paymentsClient.approveOutgoingPayment(id, incomingPaymentId);
      return reply.status(200).send({ id: `${incomingPaymentId}_${id}` });
    } catch (err) {
      server.log.error(err);
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}

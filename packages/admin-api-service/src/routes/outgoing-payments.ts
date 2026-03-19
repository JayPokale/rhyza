'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

interface OutgoingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

// TODO replace with util from pal client
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
  }>('/outgoing-payment', async (request, reply) => {
    const { walletAddress } = request.body;

    const id = request.body.id ?? randomUUID();

    let quoteId: string | undefined;
    let incomingPaymentId: string;

    if (request.body.quoteId) {
      if (!request.body.quoteId.includes('_')) {
        return reply.status(400).send({
          error: 'Invalid quoteId provided'
        });
      }

      const [_quoteId, _incomingPaymentId] = request.body.quoteId.split('_');
      quoteId = _quoteId;
      incomingPaymentId = _incomingPaymentId;
    } else if (request.body.incomingPaymentId) {
      incomingPaymentId = request.body.incomingPaymentId;
    } else {
      return reply.status(400).send({
        error: 'Either quoteId or incomingPaymentId must be provided'
      });
    }

    const { prefix, suffix } = parseWalletAddress(walletAddress);
    const alias = await palClient.ResolveWalletAddressAlias(prefix, suffix);
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
      quoteId
    );

    return reply.status(201).send({ id: result.id });
  });
}

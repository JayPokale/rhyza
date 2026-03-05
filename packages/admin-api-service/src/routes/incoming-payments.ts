'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PaymentsClient } from 'payments-client-lib';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  paymentsClient: PaymentsClient;
}

export async function incomingPaymentRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { paymentsClient } = opts;

  server.post<{
    Body: {
      walletAddressId: string;
      id?: string;
      incomingAmount?: number;
      expiresAt?: string;
      metadata?: string;
    };
  }>('/incoming-payments', async (request, reply) => {
    const { walletAddressId, incomingAmount, expiresAt, metadata } =
      request.body;

    const id = request.body.id ?? randomUUID();

    const result = await paymentsClient.createIncomingPayment(
      id,
      walletAddressId,
      incomingAmount,
      expiresAt,
      metadata
    );

    return reply.status(201).send({ id: result.id });
  });
}

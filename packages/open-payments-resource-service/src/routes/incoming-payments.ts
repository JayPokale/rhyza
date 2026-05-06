'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { OpenPaymentsResourceServerRouteError } from '../errors';

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
      incomingAmount?: {
        assetScale: number;
        assetCode: string;
        value: string;
      };
      expiresAt?: string;
      metadata?: Record<string, unknown>;
    };
  }>(
    '/incoming-payments',
    {
      schema: {
        body: { $ref: '#/components/schemas/createIncomingPaymentRequest#' }
      }
    },
    async (request, reply) => {
      const {
        walletAddress: walletAddressUrl,
        incomingAmount,
        expiresAt,
        metadata
      } = request.body;

      const id = randomUUID();

      const { domain, pathName } =
        parseAddressToDomainAndPathName(walletAddressUrl);

      const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);

      if (!alias) {
        throw new OpenPaymentsResourceServerRouteError(
          400,
          'Wallet address not found',
          'not_found'
        );
      }

      const walletAddresses = await palClient.getWalletAddresses([
        alias.walletAddressId
      ]);

      if (!walletAddresses.length) {
        throw new OpenPaymentsResourceServerRouteError(
          404,
          'Wallet address not found',
          'not_found'
        );
      }

      const walletAddress = walletAddresses[0];

      if (
        incomingAmount &&
        (incomingAmount.assetCode !== walletAddress.assetCode ||
          incomingAmount.assetScale !== walletAddress.assetScale)
      ) {
        throw new OpenPaymentsResourceServerRouteError(
          404,
          'incomingAmount asset does not match wallet address asset',
          'invalid_request'
        );
      }

      const result = await paymentsClient.createIncomingPayment(
        id,
        walletAddress.id,
        `${domain}/${pathName}`,
        incomingAmount ? Number(incomingAmount.value) : undefined,
        expiresAt,
        JSON.stringify(metadata)
      );

      return reply.status(201).send({ id: result.id });
    }
  );
}

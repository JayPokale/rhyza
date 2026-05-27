'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { OpenPaymentsResourceServerRouteError } from '../errors';

interface QuoteRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

interface Amount {
  assetScale: number;
  assetCode: string;
  value: string;
}

export async function quoteRoutes(
  server: FastifyInstance,
  opts: QuoteRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: {
      walletAddress: string;
      receiver: string;
      method: 'ilp';
      debitAmount?: Amount;
      receiveAmount?: Amount;
    };
  }>(
    '/quotes',
    {
      schema: {
        body: { $ref: '#/components/schemas/create-quote-request#' }
      }
    },
    async (request, reply) => {
      const {
        walletAddress: walletAddressUrl,
        receiver: incomingPaymentUrl,
        receiveAmount,
        debitAmount
      } = request.body;

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
        debitAmount &&
        (debitAmount.assetCode !== walletAddress.assetCode ||
          debitAmount.assetScale !== walletAddress.assetScale)
      ) {
        throw new OpenPaymentsResourceServerRouteError(
          404,
          'debitAmount asset does not match wallet address asset',
          'invalid_request'
        );
      }

      const id = randomUUID();

      const result = await paymentsClient.createQuote(
        id,
        { incomingPaymentUrl },
        alias.walletAddressId,
        walletAddressUrl,
        Number(debitAmount?.value),
        Number(receiveAmount?.value)
      );

      return reply.status(201).send({ id: result.id });
    }
  );
}

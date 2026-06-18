'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { OpenPaymentsResourceServerRouteError } from '../errors';
import { components } from '../types/generated/resource-server-types';

interface QuoteRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

export async function quoteRoutes(
  server: FastifyInstance,
  opts: QuoteRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: components['schemas']['create-quote-request'];
  }>(
    '/quotes',
    {
      schema: {
        body: { $ref: '#/components/schemas/create-quote-request#' }
      }
    },
    async (request, reply) => {
      const { walletAddress: walletAddressUrl, receiver: incomingPaymentUrl } =
        request.body;

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

      let debitAmountValue: number | undefined;
      let receiveAmountValue: number | undefined;

      if ('debitAmount' in request.body && request.body.debitAmount) {
        if (
          request.body.debitAmount.assetCode !== walletAddress.assetCode ||
          request.body.debitAmount.assetScale !== walletAddress.assetScale
        ) {
          throw new OpenPaymentsResourceServerRouteError(
            404,
            'debitAmount asset does not match wallet address asset',
            'invalid_request'
          );
        }
        debitAmountValue = Number(request.body.debitAmount);
      } else if (
        'receiveAmount' in request.body &&
        request.body.receiveAmount
      ) {
        receiveAmountValue = Number(request.body.receiveAmount);
      }

      const id = randomUUID();

      const result = await paymentsClient.createQuote(
        id,
        { incomingPaymentUrl },
        alias.walletAddressId,
        walletAddressUrl,
        debitAmountValue,
        receiveAmountValue
      );

      return reply.status(201).send({ id: result.id });
    }
  );
}

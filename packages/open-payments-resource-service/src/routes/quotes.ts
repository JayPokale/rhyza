'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import {
  httpStatusFromGrpcError,
  PaymentsClient,
  toClientApiErrorResponse
} from 'payments-client-lib';
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

  server.get<{
    Params: { id: string };
    Reply:
      | components['schemas']['quote']
      | components['schemas']['error-response'];
  }>('/quotes/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const quote = await paymentsClient.getQuote(id);

      if (quote.state !== 'COMPLETED') {
        throw new OpenPaymentsResourceServerRouteError(
          404,
          'Quote is not completed',
          'not_found'
        );
      }

      const paymentIntent = await paymentsClient.getPaymentIntent(
        quote.paymentIntentId
      );

      const walletAddresses = await palClient.getWalletAddresses([
        quote.senderWalletAddressId,
        paymentIntent.receiverWalletAddress
      ]);

      const senderWallet = walletAddresses.find(
        (wallet) => wallet.id === quote.senderWalletAddressId
      );

      const receiverWallet = walletAddresses.find(
        (wallet) => wallet.id === paymentIntent.receiverWalletAddress
      );

      if (!senderWallet || !receiverWallet) {
        throw new OpenPaymentsResourceServerRouteError(
          404,
          'Wallet address not found',
          'not_found'
        );
      }

      const response: components['schemas']['quote'] = {
        id: quote.id,
        walletAddress: quote.senderWalletAddress,
        expiresAt: quote.expiresAt,
        debitAmount: {
          value: String(quote.debitAmount),
          assetCode: senderWallet.assetCode,
          assetScale: senderWallet.assetScale
        },
        receiveAmount: {
          value: String(quote.receiveAmount),
          assetCode: receiverWallet.assetCode,
          assetScale: receiverWallet.assetScale
        },
        method: 'ilp',
        createdAt: quote.createdAt,
        receiver: paymentIntent.receiverWalletAddress
      };
      return reply.status(200).send(response);
    } catch (err: unknown) {
      const httpStatus = httpStatusFromGrpcError(err);
      return reply.status(httpStatus).send(toClientApiErrorResponse(err));
    }
  });

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

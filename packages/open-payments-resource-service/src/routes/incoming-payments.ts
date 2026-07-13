'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { OpenPaymentsResourceServerRouteError } from '../errors';
import { components } from '../types/generated/resource-server-types';
import { IIlpClient } from '../stubs/ilp-client.js';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
  ilpClient: IIlpClient;
}

export async function incomingPaymentRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient, ilpClient } = opts;

  server.post<{
    Body: components['schemas']['create-incoming-payment-request'];
    // Reply: components['schemas']['incoming-payment']
  }>(
    '/incoming-payments',
    {
      schema: {
        body: { $ref: '#/components/schemas/create-incoming-payment-request#' }
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

      const result = await paymentsClient.createPaymentIntent(
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

  server.get<{
    Params: { id: string };
    Reply: components['schemas']['incoming-payment'] & {
      destinationIlpAddress?: string;
    };
  }>('/incoming-payments/:id', async (request, reply) => {
    const { id } = request.params;

    let paymentIntent;
    try {
      paymentIntent = await paymentsClient.getPaymentIntent(id);
    } catch {
      throw new OpenPaymentsResourceServerRouteError(
        400,
        'Incoming payment not found',
        'not_found'
      );
    }

    const response: components['schemas']['incoming-payment'] & {
      destinationIlpAddress?: string;
      sharedSecret: string;
    } = {
      id: paymentIntent.id,
      expiresAt: paymentIntent.expiresAt,
      completed: paymentIntent.state === 'COMPLETED',
      walletAddress: paymentIntent.receiverWalletAddress,
      createdAt: new Date().toISOString(),
      receivedAmount: {
        value: String(paymentIntent.receivedAmount),
        assetCode: paymentIntent.assetCode,
        assetScale: paymentIntent.assetScale
      },
      sharedSecret: await ilpClient.generateStreamCredentials()
    };

    if (paymentIntent.incomingAmount != null) {
      response.incomingAmount = {
        value: String(paymentIntent.incomingAmount),
        assetCode: paymentIntent.assetCode,
        assetScale: paymentIntent.assetScale
      };
    }

    if (paymentIntent.expiresAt) {
      response.expiresAt = paymentIntent.expiresAt;
    }

    if (paymentIntent.destinationIlpAddress) {
      response.destinationIlpAddress = paymentIntent.destinationIlpAddress;
    }

    return reply.status(200).send(response);
  });
}

'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import {
  httpStatusFromGrpcError,
  isGrpcServiceError,
  toClientApiErrorResponse,
  PaymentsClient,
  GetPaymentIntentResult
} from 'payments-client-lib';
import { OpenPaymentsResourceServerRouteError } from '../errors.js';
import { components } from '../types/generated/resource-server-types.js';
import { createStreamServer, generateStreamCredentials } from 'ilp-client-lib';
import { randomUUID } from 'crypto';

type StreamServer = ReturnType<typeof createStreamServer>;

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
  streamServer: StreamServer;
  /** Base URL of this node's Open Payments resource server, used to construct resource ids. */
  openPaymentsUrl: string;
}

export function toIncomingPaymentBody(
  paymentIntent: GetPaymentIntentResult,
  openPaymentsUrl: string
): components['schemas']['incoming-payment'] {
  const body: components['schemas']['incoming-payment'] = {
    id: `${openPaymentsUrl}/incoming-payments/${paymentIntent.id}`,
    completed: paymentIntent.state === 'COMPLETED',
    walletAddress: paymentIntent.receiverWalletAddress,
    createdAt: paymentIntent.createdAt,
    receivedAmount: {
      value: String(paymentIntent.receivedAmount),
      assetCode: paymentIntent.assetCode,
      assetScale: paymentIntent.assetScale
    }
  };

  if (paymentIntent.incomingAmount != null) {
    body.incomingAmount = {
      value: String(paymentIntent.incomingAmount),
      assetCode: paymentIntent.assetCode,
      assetScale: paymentIntent.assetScale
    };
  }

  if (paymentIntent.expiresAt) {
    body.expiresAt = paymentIntent.expiresAt;
  }

  return body;
}

function toIncomingPaymentWithMethods(
  paymentIntent: GetPaymentIntentResult,
  streamServer: StreamServer,
  openPaymentsUrl: string
): components['schemas']['incoming-payment-with-methods'] {
  const streamCredentials = generateStreamCredentials(streamServer, {
    paymentIntentId: paymentIntent.id,
    assetCode: paymentIntent.assetCode,
    assetScale: paymentIntent.assetScale
  });

  return {
    ...toIncomingPaymentBody(paymentIntent, openPaymentsUrl),
    methods: [
      {
        type: 'ilp',
        ilpAddress: streamCredentials.ilpAddress,
        sharedSecret: streamCredentials.sharedSecret
      }
    ]
  };
}

export async function incomingPaymentRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient, streamServer, openPaymentsUrl } = opts;

  server.post<{
    Body: components['schemas']['create-incoming-payment-request'];
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
          400,
          'incomingAmount asset does not match wallet address asset',
          'invalid_request'
        );
      }

      try {
        const result = await paymentsClient.createPaymentIntent(
          id,
          walletAddress.id,
          `${domain}/${pathName}`,
          incomingAmount ? Number(incomingAmount.value) : undefined,
          expiresAt,
          JSON.stringify(metadata)
        );

        const paymentIntent = await paymentsClient.getPaymentIntent(result.id);

        return reply
          .status(201)
          .send(
            toIncomingPaymentWithMethods(
              paymentIntent,
              streamServer,
              openPaymentsUrl
            )
          );
      } catch (err) {
        const httpStatus = httpStatusFromGrpcError(err);
        const message = isGrpcServiceError(err)
          ? err.details || err.message
          : (err as Error).message;
        return reply.status(httpStatus).send({ error: message });
      }
    }
  );

  server.get<{
    Params: { id: string };
    Reply:
      | components['schemas']['incoming-payment-with-methods']
      | components['schemas']['error-response'];
  }>('/incoming-payments/:id', async (request, reply) => {
    const { id } = request.params;

    let paymentIntent;
    try {
      paymentIntent = await paymentsClient.getPaymentIntent(id);
    } catch (err) {
      const httpStatus = httpStatusFromGrpcError(err);
      return reply.status(httpStatus).send(toClientApiErrorResponse(err));
    }

    return reply
      .status(200)
      .send(
        toIncomingPaymentWithMethods(
          paymentIntent,
          streamServer,
          openPaymentsUrl
        )
      );
  });

  server.get<{
    Querystring: {
      'wallet-address': string;
      cursor?: string;
      first?: string;
      last?: string;
    };
  }>('/incoming-payments', async (request, reply) => {
    const walletAddressUrl = request.query['wallet-address'];

    if (!walletAddressUrl) {
      throw new OpenPaymentsResourceServerRouteError(
        400,
        "Missing required query parameter 'wallet-address'",
        'invalid_request'
      );
    }

    const { domain, pathName } =
      parseAddressToDomainAndPathName(walletAddressUrl);
    const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);

    if (!alias) {
      return reply.status(200).send({
        pagination: { hasNextPage: false, hasPreviousPage: false },
        result: []
      });
    }

    try {
      // Open Payments does not expose a sort order, so it is pinned here
      // rather than inherited from the payments-side default. This ensures
      // consistency with Rafiki.
      const page = await paymentsClient.getPaymentIntentsPage({
        sortOrder: 'desc',
        walletAddressId: alias.walletAddressId,
        cursor: request.query.cursor,
        first:
          request.query.first != null ? Number(request.query.first) : undefined,
        last:
          request.query.last != null ? Number(request.query.last) : undefined
      });

      return reply.status(200).send({
        pagination: page.pagination,
        result: page.items.map((paymentIntent) =>
          toIncomingPaymentBody(paymentIntent, openPaymentsUrl)
        )
      });
    } catch (err) {
      const httpStatus = httpStatusFromGrpcError(err);
      return reply.status(httpStatus).send(toClientApiErrorResponse(err));
    }
  });

  server.post<{
    Params: { id: string };
    Reply:
      | components['schemas']['incoming-payment']
      | components['schemas']['error-response'];
  }>('/incoming-payments/:id/complete', async (request, reply) => {
    const { id } = request.params;

    let paymentIntent;
    try {
      paymentIntent = await paymentsClient.completePaymentIntent(id);
    } catch (err) {
      const httpStatus = httpStatusFromGrpcError(err);
      return reply.status(httpStatus).send(toClientApiErrorResponse(err));
    }

    const response: components['schemas']['incoming-payment'] =
      toIncomingPaymentBody(paymentIntent, openPaymentsUrl);

    return reply.status(200).send(response);
  });
}

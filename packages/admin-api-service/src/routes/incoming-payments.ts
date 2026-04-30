'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { MongoDbPaymentIntentRepo } from 'payments-implementations-lib';

interface IncomingPaymentRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
  openPaymentsUrl: string | undefined;
  repo: MongoDbPaymentIntentRepo;
}

// TODO: get properly
const STUB_DESTINATION_ILP_ADDRESS = 'test.rafiki.bob';

export async function incomingPaymentRoutes(
  server: FastifyInstance,
  opts: IncomingPaymentRouteOptions
): Promise<void> {
  const { palClient, paymentsClient, openPaymentsUrl, repo } = opts;

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

    const response: { id: string; openPaymentsUrl?: string } = {
      id: result.id
    };

    if (openPaymentsUrl) {
      response.openPaymentsUrl = `${openPaymentsUrl}/incoming-payments/${result.id}`;
    }

    return reply.status(201).send(response);
  });

  // TODO: Clarify scope of this endpoint. should it be /payment-intent and
  // have quote and payments? Currently only exposing for fetching remote payment intents
  // but long term we wont use this for that purpose (will use open payments api when it exists).
  server.get<{ Params: { id: string } }>(
    '/incoming-payments/:id',
    async (request, reply) => {
      const { id } = request.params;

      const [paymentIntent] = await repo.fetchByIdsWithPayments([id]);

      if (!paymentIntent) {
        return reply
          .status(404)
          .send({ error: `Incoming payment '${id}' not found` });
      }

      const response: {
        walletAddress: string;
        incomingAmount?: {
          value: string;
          assetCode: string;
          assetScale: number;
        };
        receivedAmount: {
          value: string;
          assetCode: string;
          assetScale: number;
        };
        expiresAt?: string;
        destinationIlpAddress: string;
      } = {
        walletAddress: paymentIntent.receiverWalletAddress,
        receivedAmount: {
          value: String(paymentIntent.receivedAmount),
          assetCode: paymentIntent.assetCode,
          assetScale: paymentIntent.assetScale
        },
        destinationIlpAddress: STUB_DESTINATION_ILP_ADDRESS
      };

      if (paymentIntent.incomingAmount) {
        response.incomingAmount = {
          value: String(paymentIntent.incomingAmount),
          assetCode: paymentIntent.assetCode,
          assetScale: paymentIntent.assetScale
        };
      }

      if (paymentIntent.expiresAt) {
        response.expiresAt = new Date(paymentIntent.expiresAt).toISOString();
      }

      return reply.status(200).send(response);
    }
  );
}

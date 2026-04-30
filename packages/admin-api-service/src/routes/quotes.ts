'use strict';

import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';

type QuoteInput =
  | { kind: 'url'; incomingPaymentUrl: string }
  | { kind: 'id'; incomingPaymentId: string };

function parseQuoteInput(
  incomingPaymentId?: string,
  incomingPaymentUrl?: string
): QuoteInput | null {
  if (incomingPaymentUrl) return { kind: 'url', incomingPaymentUrl };
  if (incomingPaymentId) return { kind: 'id', incomingPaymentId };
  return null;
}

interface QuoteRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
  openPaymentsUrl: string | undefined;
}

export async function quoteRoutes(
  server: FastifyInstance,
  opts: QuoteRouteOptions
): Promise<void> {
  const { palClient, paymentsClient, openPaymentsUrl } = opts;

  server.post<{
    Body: {
      walletAddress: string;
      id?: string;
      incomingPaymentId?: string;
      incomingPaymentUrl?: string;
      debitAmount?: string;
      receiveAmount?: string;
    };
  }>('/quotes', async (request, reply) => {
    const {
      walletAddress,
      debitAmount,
      receiveAmount,
      incomingPaymentId,
      incomingPaymentUrl
    } = request.body;

    const input = parseQuoteInput(incomingPaymentId, incomingPaymentUrl);
    if (!input) {
      return reply.status(400).send({
        error: 'Either incomingPaymentId or incomingPaymentUrl is required'
      });
    }

    if (input.kind === 'url' && !openPaymentsUrl) {
      return reply.status(500).send({
        error: 'Remote quoting is not configured (OPEN_PAYMENTS_URL is not set)'
      });
    }

    const id = request.body.id ?? randomUUID();

    const { domain, pathName } = parseAddressToDomainAndPathName(walletAddress);
    const alias = await palClient.ResolveWalletAddressAlias(domain, pathName);
    if (!alias) {
      return reply
        .status(404)
        .send({ error: `Wallet address '${walletAddress}' not found` });
    }

    let paymentIntentId: string;

    if (
      input.kind === 'url' &&
      !input.incomingPaymentUrl.startsWith(openPaymentsUrl!)
    ) {
      const localId = randomUUID();
      const remoteResult = await paymentsClient.importRemotePaymentIntent(
        localId,
        input.incomingPaymentUrl
      );
      paymentIntentId = remoteResult.id;
    } else if (input.kind === 'url') {
      paymentIntentId = input.incomingPaymentUrl.split('/').at(-1)!;
    } else {
      paymentIntentId = input.incomingPaymentId;
    }

    const result = await paymentsClient.createQuote(
      id,
      paymentIntentId,
      alias.walletAddressId,
      walletAddress,
      Number(debitAmount),
      Number(receiveAmount)
    );

    return reply.status(201).send({ id: `${paymentIntentId}_${result.id}` }); // Concatenate ids when returning the request
  });
}

'use strict';

import { QuoteCreate, Quote, ErrorResponse } from 'admin-client-lib';
import { randomUUID } from 'crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient, parseAddressToDomainAndPathName } from 'pal-client-lib';
import {
  GetQuoteResult,
  PaymentsClient,
  httpStatusFromGrpcError,
  toClientApiErrorResponse
} from 'payments-client-lib';

interface QuoteRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  paymentsClient: PaymentsClient;
}

function toQuoteBody(quote: GetQuoteResult): Quote {
  const body: Quote = {
    id: quote.id,
    paymentIntentId: quote.paymentIntentId,
    state: quote.state,
    senderWalletAddress: quote.senderWalletAddress,
    senderWalletAddressId: quote.senderWalletAddressId,
    createdAt: quote.createdAt
  };

  switch (quote.state) {
    case 'COMPLETED':
      if (quote.expiresAt !== undefined) {
        body.expiresAt = quote.expiresAt;
      }
      if (quote.debitAmount !== undefined) {
        body.debitAmount = String(quote.debitAmount);
      }
      if (quote.receiveAmount !== undefined) {
        body.receiveAmount = String(quote.receiveAmount);
      }
      if (quote.exchangeRate !== undefined) {
        body.exchangeRate = quote.exchangeRate;
      }
      break;
    case 'PENDING':
      if (quote.debitAmount !== undefined) {
        body.debitAmount = String(quote.debitAmount);
      }
      if (quote.receiveAmount !== undefined) {
        body.receiveAmount = String(quote.receiveAmount);
      }
      if (quote.sourceAmount !== undefined) {
        body.sourceAmount = String(quote.sourceAmount);
      }
      if (quote.senderAssetCode !== undefined) {
        body.senderAssetCode = quote.senderAssetCode;
      }
      break;
    case 'FAILED':
      if (quote.errorName !== undefined) {
        body.errorName = quote.errorName;
      }
      if (quote.message !== undefined) {
        body.message = quote.message;
      }
      break;
  }

  return body;
}

export async function quoteRoutes(
  server: FastifyInstance,
  opts: QuoteRouteOptions
): Promise<void> {
  const { palClient, paymentsClient } = opts;

  server.post<{
    Body: QuoteCreate;
    Reply: Quote | ErrorResponse;
  }>('/quotes', async (request, reply) => {
    const {
      walletAddress,
      debitAmount,
      receiveAmount,
      paymentIntentId,
      paymentIntentUrl
    } = request.body;

    let incomingPayment:
      | { incomingPaymentUrl: string }
      | { incomingPaymentId: string };
    if (paymentIntentUrl) {
      incomingPayment = { incomingPaymentUrl: paymentIntentUrl };
    } else if (paymentIntentId) {
      incomingPayment = { incomingPaymentId: paymentIntentId };
    } else {
      return reply.status(400).send({
        error: 'Either paymentIntentId or paymentIntentUrl is required'
      });
    }

    const id = request.body.id ?? randomUUID();

    const { domain, pathName } = parseAddressToDomainAndPathName(walletAddress);
    const alias = await palClient.resolveWalletAddressAlias(domain, pathName);
    if (!alias) {
      return reply
        .status(404)
        .send({ error: `Wallet address '${walletAddress}' not found` });
    }

    const result = await paymentsClient.createQuote(
      id,
      incomingPayment,
      alias.walletAddressId,
      walletAddress,
      debitAmount ? Number(debitAmount) : undefined,
      receiveAmount ? Number(receiveAmount) : undefined
    );

    return reply.status(201).send({
      id: result.id,
      paymentIntentId: result.paymentIntentId,
      senderWalletAddress: result.senderWalletAddress,
      senderWalletAddressId: result.senderWalletAddressId,
      expiresAt: new Date(result.expiresAt),
      debitAmount: String(result.debitAmount),
      receiveAmount: String(result.receiveAmount),
      exchangeRate: result.exchangeRate
    });
  });

  server.get<{ Params: GetQuoteParams }>(
    '/payment-intents/:intentId/quotes/:id',
    async (request, reply) => {
      const { intentId, id } = request.params;

      try {
        const quote = await paymentsClient.getQuote(intentId, id);
        return reply.status(200).send(toQuoteBody(quote));
      } catch (err) {
        server.log.error(err);
        const httpStatus = httpStatusFromGrpcError(err);
        const { error } = toClientApiErrorResponse(err);
        return reply.status(httpStatus).send({ error: error.description });
      }
    }
  );
}

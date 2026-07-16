'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { IMessageProducer } from 'common-types-lib';
import { PostTransactionCmd } from 'pal-domain-lib';
import crypto from 'crypto';

// TODO: carve out a better path for depositing liquidity than dragging in kafka,
// creating the command, and returning 202?

interface LiquidityRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  producer: IMessageProducer;
}

export async function liquidityRoutes(
  server: FastifyInstance,
  opts: LiquidityRouteOptions
): Promise<void> {
  const { palClient, producer } = opts;

  server.post<{
    Body: {
      assetCode: string;
      peerId: string;
      amount: number;
    };
  }>('/liquidity/deposit', async (request, reply) => {
    const { assetCode, peerId, amount } = request.body;

    if (!assetCode || !peerId || amount == null) {
      return reply
        .status(400)
        .send({ error: 'assetCode, peerId and amount are required' });
    }

    const asset = await palClient.getAsset(assetCode);
    if (!asset || !asset.ledgerAccountId) {
      return reply.status(404).send({
        error: `Asset ${assetCode} not found or missing its ledger (system) account`
      });
    }

    const peer = await palClient.getPeer(peerId);
    const aseLiquidityAccId = peer?.ledgerAccounts?.aseLiquidityAccId;
    if (!aseLiquidityAccId) {
      return reply.status(404).send({
        error: `Peer ${peerId} not found or missing its ledger accounts`
      });
    }

    // Deposit liquidity: debit the asset system account, credit the peer's ASE
    // liquidity account. The ledger id is the asset code.
    const cmd = new PostTransactionCmd(assetCode, {
      id: crypto.randomUUID(),
      amount: String(amount),
      amountScale: asset.scale,
      debitedAccountId: asset.ledgerAccountId,
      creditedAccountId: aseLiquidityAccId
    });

    await producer.send(cmd);

    // TODO: make this synchronous. This is fire-and-forget — the ledger posts
    // the transaction asynchronously and could reject it (e.g. bad account)
    // without the caller knowing. Correlate a ledger result event by transaction
    // id (like the payments gRPC response map) and return success/failure
    // instead of a bare 202.
    return reply.status(202).send({ id: cmd.payload.id });
  });
}

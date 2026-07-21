'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { IMessageProducer } from 'common-types-lib';
import { PostTransactionCmd } from 'pal-domain-lib';
import crypto from 'crypto';
import { LiquidityDepositRequest } from 'admin-client-lib';

interface LiquidityRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  producer: IMessageProducer;
}

export async function liquidityRoutes(
  server: FastifyInstance,
  opts: LiquidityRouteOptions
): Promise<void> {
  const { palClient, producer } = opts;

  // TODO: carve out a better path for depositing liquidity than dragging in kafka,
  // creating the command, and returning 202?
  server.post<{
    Body: LiquidityDepositRequest;
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

    return reply.status(202).send({ id: cmd.payload.id });
  });
}

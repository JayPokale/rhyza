'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';

interface WalletAddressRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
}

export async function walletAddressRoutes(
  server: FastifyInstance,
  opts: WalletAddressRouteOptions
): Promise<void> {
  const { palClient } = opts;

  server.post<{
    Body: {
      address: string;
      publicName: string;
      assetCode: string;
      isActive?: boolean;
    };
  }>('/wallet-addresses', async (request, reply) => {
    const { address, publicName, assetCode, isActive } = request.body;

    const result = await palClient.createWalletAddress(
      address,
      publicName,
      assetCode,
      isActive
    );

    return reply.status(201).send({
      address: result.address
    });
  });
}

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

    let result;
    try {
      result = await palClient.createWalletAddress(
        address,
        publicName,
        assetCode,
        isActive
      );
    } catch (err: any) {
      // TODO: PAL service returns gRPC code 2 (UNKNOWN) for duplicates — should probably
      // be code 6 (ALREADY_EXISTS) so we can check err.code instead of string matching.
      if (
        err.message?.includes('already exists') ||
        err.details?.includes('already exists')
      ) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }

    return reply.status(201).send({
      address: result.address
    });
  });
}

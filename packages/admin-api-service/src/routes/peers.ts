'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';

interface PeerRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
}

export async function peerRoutes(
  server: FastifyInstance,
  opts: PeerRouteOptions
): Promise<void> {
  const { palClient } = opts;

  server.post<{
    Body: {
      id: string;
      name: string;
      assetCode: string;
      assetScale: number;
      ilpStaticAddress: string;
    };
  }>('/peers', async (request, reply) => {
    const { id, name, assetCode, assetScale, ilpStaticAddress } = request.body;

    try {
      await palClient.createPeer(
        id,
        name,
        assetCode,
        assetScale,
        ilpStaticAddress
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (
        err.message?.includes('already exists') ||
        err.details?.includes('already exists')
      ) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }

    return reply.status(201).send({ id });
  });
}

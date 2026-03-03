'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';

interface AssetRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
}

export async function assetRoutes(
  server: FastifyInstance,
  opts: AssetRouteOptions
): Promise<void> {
  const { palClient } = opts;

  server.post<{
    Body: {
      code: string;
      scale: number;
      liquidityLowThreshold?: number;
      liquidityHighThreshold?: number;
    };
  }>('/assets', async (request, reply) => {
    const { code, scale, liquidityLowThreshold, liquidityHighThreshold } =
      request.body;

    await palClient.createAsset(
      code,
      scale,
      liquidityLowThreshold !== undefined
        ? BigInt(liquidityLowThreshold)
        : undefined,
      liquidityHighThreshold !== undefined
        ? BigInt(liquidityHighThreshold)
        : undefined
    );

    return reply.status(201).send({ code });
  });
}

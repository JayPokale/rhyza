import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';

interface RateRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
}

export async function ratesRoutes(
  server: FastifyInstance,
  opts: RateRouteOptions
): Promise<void> {
  const { palClient } = opts;
  server.post<{
    Body: {
      sourceAssetCode: string;
      destinationAssetCode: string;
      rate: number;
      peerId: string | null;
      rateTtlSecs: number;
    };
  }>('/rates', async (request, reply) => {
    const {
      sourceAssetCode,
      destinationAssetCode,
      rate: fxRate,
      peerId,
      rateTtlSecs
    } = request.body;

    if (
      !sourceAssetCode ||
      !destinationAssetCode ||
      fxRate == null ||
      rateTtlSecs == null
    ) {
      return reply.status(400).send({
        error:
          'sourceAssetCode, destinationAssetCode, rate and rateTtlSecs are required'
      });
    }

    const rate = await palClient.setFxRate(
      sourceAssetCode,
      destinationAssetCode,
      fxRate,
      peerId,
      rateTtlSecs
    );
    return reply.status(200).send({ rate });
  });
}

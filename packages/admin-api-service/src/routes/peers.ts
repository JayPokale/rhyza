'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { IlpClient, IlpClientPeerAlreadyExistsError } from 'ilp-client-lib';
import { PeerCreate } from 'admin-client-lib';

interface PeerRouteOptions extends FastifyPluginOptions {
  palClient: PalClient;
  ilpClient: IlpClient;
}

export async function peerRoutes(
  server: FastifyInstance,
  opts: PeerRouteOptions
): Promise<void> {
  const { palClient, ilpClient } = opts;

  server.post<{
    Body: PeerCreate;
  }>('/peers', async (request, reply) => {
    const {
      id,
      name,
      assetCode,
      assetScale,
      ilpStaticAddress,
      http,
      isActive
    } = request.body;

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

    try {
      await ilpClient.createPeer(id, http, isActive);
    } catch (err) {
      try {
        await palClient.deactivatePeer(id);
      } catch (error) {
        request.log.error(
          error,
          `Failed to deactivate PAL peer ${id} after ILP createPeer failure`
        );
      }

      if (err instanceof IlpClientPeerAlreadyExistsError) {
        return reply.status(409).send({ error: (err as Error).message });
      }
      return reply.status(502).send({
        error: `Peer ${id} was created in PAL but ILP connector configuration failed: ${(err as Error).message}. The PAL peer has been deactivated; retry the request.`
      });
    }

    return reply.status(201).send({ id });
  });
}

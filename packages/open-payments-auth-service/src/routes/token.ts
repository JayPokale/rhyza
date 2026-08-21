'use strict';

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthClient } from 'auth-client-lib';
import { components } from '../types/generated/auth-server-types';
import { createAccessTokenResponse, decodeCompoundId } from '../utils';
import { requireSignatureHeaders, getGnapTokenOrThrow } from '../auth';

interface TokenRouteOptions extends FastifyPluginOptions {
  authClient: AuthClient;
  openPaymentsAuthServerUrl: string;
}

type RotateTokenResponse = {
  access_token: components['schemas']['access_token'];
};

export async function tokenRoutes(
  server: FastifyInstance,
  opts: TokenRouteOptions
): Promise<void> {
  const { authClient, openPaymentsAuthServerUrl } = opts;

  server.post<{
    Params: { id: string };
    Reply: RotateTokenResponse;
  }>(
    '/token/:id',
    {
      onRequest: async (request) => {
        requireSignatureHeaders(request);
        getGnapTokenOrThrow(request);
      }
    },
    async (request, reply) => {
      const tokenValue = request.gnapToken!;

      const { grantId, otherId: managementId } = decodeCompoundId(
        request.params.id
      );

      const result = await authClient.rotateToken(
        grantId,
        tokenValue,
        managementId
        //TODO pass in http signature data
      );

      return reply.status(200).send({
        access_token: createAccessTokenResponse(
          grantId,
          result.newAccessTokenManagementId,
          result.newAccessTokenValue,
          result.newAccessTokenExpiresIn,
          result.access,
          openPaymentsAuthServerUrl
        )
      });
    }
  );

  server.delete<{
    Params: { id: string };
  }>(
    '/token/:id',
    {
      onRequest: async (request) => {
        requireSignatureHeaders(request);
        getGnapTokenOrThrow(request);
      }
    },
    async (request, reply) => {
      const tokenValue = request.gnapToken!;

      const { grantId, otherId: managementId } = decodeCompoundId(
        request.params.id
      );

      await authClient.revokeToken(
        grantId,
        tokenValue,
        managementId
        //TODO pass in http signature data
      );

      return reply.status(204).send();
    }
  );
}

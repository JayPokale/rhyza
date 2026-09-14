import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthClient } from 'auth-client-lib';
import { verifyIdpSecret } from '../auth';

interface InteractionRouteOptions extends FastifyPluginOptions {
  authClient: AuthClient;
}

export async function interactionRoutes(
  server: FastifyInstance,
  opts: InteractionRouteOptions
): Promise<void> {
  const { authClient } = opts;

  server.get<{
    Params: { id: string; nonce: string };
  }>('/grant/:id/:nonce', async (request, reply) => {
    const { id } = request.params;

    const grant = await authClient.getGrant(id);

    return reply.status(200).send({
      id: grant.id,
      access: grant.accesses,
      subject: grant.subjectIds ?
      {
        sub_ids: grant.subjectIds
      } : undefined,
      state: grant.state
    })
  });

  server.post<{
    Params: { grantId: string };
    Body: { interactRef: string; nonce: string };
  }>(
    '/interaction/:grantId/accept',
    {
      onRequest: async (request, reply) => {
        verifyIdpSecret(request, reply);
      }
    },
    async (request, reply) => {
      const { grantId } = request.params;
      const { interactRef, nonce } = request.body;

      await authClient.acceptInteraction(grantId, interactRef, nonce);

      return reply.status(202).send();
    }
  );

  server.post<{
    Params: { grantId: string };
    Body: { nonce: string };
  }>(
    '/interaction/:grantId/reject',
    {
      onRequest: async (request, reply) => {
        verifyIdpSecret(request, reply);
      }
    },
    async (request, reply) => {
      const { grantId } = request.params;
      const { nonce } = request.body;

      await authClient.rejectInteraction(grantId, nonce);

      return reply.status(202).send();
    }
  );
}

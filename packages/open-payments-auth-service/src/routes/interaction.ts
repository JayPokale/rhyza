import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthClient } from 'auth-client-lib';

interface InteractionRouteOptions extends FastifyPluginOptions {
  authClient: AuthClient;
  openPaymentsAuthServerUrl: string;
}

// TODO: validate that this is set on startup
const IDP_URL = process.env['IDP_URL'];

export async function interactionRoutes(
  server: FastifyInstance,
  opts: InteractionRouteOptions
): Promise<void> {
  server.get<{
    Params: { grantId: string };
    session: { authenticated: boolean };
  }>('/interaction/:grantId/start', async (request, reply) => {
    // TODO: implement
    const { authClient } = opts;
    const { grantId } = request.params;
    const { id } = await authClient.startInteraction(grantId);

    request.session.interactionSessionId = id;

    const redirectUrl = new URL(IDP_URL as string);
    // Called interactId here because that was the name of the value in v1.
    // Could change it if we are comfortable with that kind of breaking change for idp integration.
    redirectUrl.searchParams.set('interactId', grantId);
    // TODO: set client name & uri here. Though this could be relocated to the "get grant" call the idp will make.
    return reply.redirect(redirectUrl.toString());
  });

  server.post<{
    Params: { grantId: string };
  }>('/interaction/:grantId/finish', async (request, reply) => {
    // TODO: implement
    const { authClient } = opts;
    const { grantId } = request.params;
    const grant = await authClient.getGrant(grantId);
    if (request.session.interactionSessionId !== grant.interactionNonce) {
      return reply.status(401).send();
    }
    const result = await authClient.finishInteraction(
      grantId,
      grant.interactionNonce
    );

    return reply.status(501).send();
  });
}

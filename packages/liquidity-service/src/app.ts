import fastify from "fastify";
import logger from "./logger";

import { LiquidityService } from "./liquidity";

export function createApp(port: number, liquidityService: LiquidityService) {
  const app = fastify();

  app.post("/transfers", async function handler(request, reply) {
    const requestBody = request.body as any;

    await liquidityService.execute(requestBody);

    reply.code(201);
  });

  app.post("/asset-account", async function handler(request, reply) {
    const requestBody = request.body as any;

    await liquidityService.createAssetAccount({
      id: requestBody.id,
      code: requestBody.code,
      scale: requestBody.scale,
    });

    reply.code(201);
  });

  app.post("/wallet-address-account", async function handler(request, reply) {
    const requestBody = request.body as any;

    await liquidityService.createWalletAddressAccount({
      id: requestBody.id,
      assetCode: requestBody.assetCode,
      assetScale: requestBody.assetScale,
    });

    reply.code(201);
  });

  app.post("/ilp-peer-account", async function handler(request, reply) {
    const requestBody = request.body as any;

    await liquidityService.createIlpPeerAccount({
      id: requestBody.id,
      assetCode: requestBody.assetCode,
      assetScale: requestBody.assetScale,
    });

    reply.code(201);
  });

  return async () => {
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`🕹🕹🕹 Liquidity API Listening on port '${port}'`);
  };
}

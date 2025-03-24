import fastify from "fastify";
import logger from "./logger";

import { LiquidityService } from "./liquidity";

export function createApp(port: number, liquidityService: LiquidityService) {
  const app = fastify();

  app.post("/", async function handler(request, reply) {
    const requestBody = request.body as any;

    await liquidityService.execute(requestBody);

    reply.code(201);
  });

  return async () => {
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`🕹🕹🕹 Liquidity API Listening on port '${port}'`);
  };
}

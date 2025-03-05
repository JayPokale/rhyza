import fastify from "fastify";
import {
  PaymentService
} from "./payment";
import { IlpConnector } from "./ilp-connector";
import { RemoteIncomingPaymentServiceAdapter } from "./remote-incoming-payment";
import logger from "./logger";
import {IMessageConsumer, IMessageProducer} from "./message-broker/message";
import {CreateIncomingPaymentCmd, CreateOutgoingPaymentFromQuoteCmd, CreateQuoteCmd} from "./message-broker/command";
import {RafikiApiResponseCommandHandler, RafikiCommandHandler} from "./message-broker/command-handler/handler";
import {InFlightProcessor} from "./in-flight";

export function createAppCommandHandler(
  paymentService: PaymentService,
  msgConsumer: IMessageConsumer,
  msgProducer: IMessageProducer
) {
  const rafikiCommandHandler = new RafikiCommandHandler(msgConsumer, msgProducer, paymentService)
  return async () => {
    logger.info(`🥺 Starting Rafiki Command Handler::: ->`);
    await rafikiCommandHandler.start()
    logger.info(`Rafiki Command Handler started`);
    return rafikiCommandHandler
  };
}

export function createAppApiResponseCommandHandler(
  msgConsumer: IMessageConsumer,
  mapRsp: Map<string, Object | Error>
) {
  const handler = new RafikiApiResponseCommandHandler(msgConsumer, mapRsp)
  return async () => {
    logger.info(`🎱 Starting Rafiki Api Response Command Handler::: ->`);
    await handler.start()
    logger.info(`Rafiki Api Response Command Handler started`);
    return handler
  };
}

export function createApp(
  port: number,
  timeoutSeconds: number,
  remoteIncomingPaymentService: RemoteIncomingPaymentServiceAdapter,
  ilpConnector: IlpConnector,
  msgProducer: IMessageProducer,
  mapRsp: Map<string, Object | Error>
) {
  const app = fastify();
  const inFlight = new InFlightProcessor(msgProducer, mapRsp)

  app.addContentTypeParser(
    "application/octet-stream",
    {
      parseAs: "buffer",
    },
    async function (_: any, payload: Buffer) {
      return payload;
    }
  );

  app.post("/incoming-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const payload = {
      id: requestBody.id,
      expiresAt: requestBody.expiresAt,
      incomingAmount: requestBody.incomingAmount
        ? {
          assetCode: requestBody.incomingAmount.assetCode,
          assetScale: requestBody.incomingAmount.assetScale,
          value: requestBody.incomingAmount.value,
        }
        : undefined,
      walletAddressId: requestBody.walletAddressId,
    }

    const data = await inFlight.awaitProcessResponse(
      timeoutSeconds, true, new CreateIncomingPaymentCmd(payload)
    )
    logger.info(`Incoming Payment Data!!! got ${JSON.stringify(data)}`)

    const ilpDetails = ilpConnector.getIlpDetails();

    reply.code(201).send({ id : payload.id, ilpDetails });
  });

  app.post("/remote-incoming-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const id = await remoteIncomingPaymentService.createRemoteIncomingPayment({
      expiresAt: requestBody.expiresAt,
      walletAddressId: requestBody.walletAddressId, // TODO: needs to be wallet address URL
      incomingAmount: requestBody.incomingAmount
        ? {
            assetCode: requestBody.incomingAmount.assetCode,
            assetScale: requestBody.incomingAmount.assetScale,
            value: BigInt(requestBody.incomingAmount.value),
          }
        : undefined,
      resourceServerUrl: "http://localhost:3001/incoming-payment",
    });

    reply.code(201).send({ id });
  });

  app.post("/quote", async function handler(request, reply) {
    const requestBody = request.body as any;

    // TODO: As an enhancement, we can allow the client to specify whether they want back a 202
    // to just be able to fetch the quote later (async mode)
    const payload = {
      id: requestBody.id,
      debitAmount: requestBody.debitAmount
        ? {
          assetCode: requestBody.debitAmount.assetCode,
          assetScale: requestBody.debitAmount.assetScale,
          value: requestBody.debitAmount.value,
        }
        : undefined,
      receiveAmount: requestBody.receiveAmount
        ? {
          assetCode: requestBody.receiveAmount.assetCode,
          assetScale: requestBody.receiveAmount.assetScale,
          value: requestBody.receiveAmount.value,
        }
        : undefined,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      incomingPaymentId: requestBody.incomingPaymentId,
    }

    const quoteRsp = await inFlight.awaitProcessResponse(
      timeoutSeconds, true, new CreateQuoteCmd(payload)
    )
    const id = typeof quoteRsp === 'string' ? quoteRsp : undefined

    reply.code(201).send({ id });
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const payload = {
      id: requestBody.id,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      quoteId: requestBody.quoteId,
    }

    const outPayRsp = await inFlight.awaitProcessResponse(
      timeoutSeconds, true, new CreateOutgoingPaymentFromQuoteCmd(payload)
    )
    const id = typeof outPayRsp === 'string' ? outPayRsp : undefined

    reply.code(201).send({ id });
  });

  app.post("/ilp", async function handler(request, reply) {
    logger.info("Received prepare packet")

    await ilpConnector.handlePreparePacket(
      request.headers["request-id"] as string,
      request.headers["from-peer"] as string,
      request.body as Buffer
    );

    reply.code(201).send();
  });

  app.post("/ilp-reply", async function handler(request, reply) {
    logger.info("Received reject or fulfill packet");

    await ilpConnector.handleFulfillOrRejectPacket(
      request.headers["request-id"] as string,
      request.body as Buffer
    );

    reply.code(201).send();
  });

  return async () => {
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`Listening on port '${port}'`);
  };
}

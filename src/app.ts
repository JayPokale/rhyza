import fastify from "fastify";
import { PaymentService } from "./payment";
import { IlpConnector } from "./ilp-connector";
import { RemoteIncomingPaymentServiceAdapter } from "./remote-incoming-payment";
import logger from "./logger";
import {IMessageConsumer, IMessageProducer} from "./message-broker/message";
import {CreateQuoteCmd} from "./message-broker/command";
import {RafikiCommandHandler} from "./message-broker/command-handler/handler";

export function createAppCommandHandler(
  paymentService: PaymentService,
  msgConsumer: IMessageConsumer
) {
  const rafikiCommandHandler = new RafikiCommandHandler(msgConsumer, paymentService)
  return async () => {
    logger.info(`🥺Starting Rafiki Command Handler::: ->`);
    await rafikiCommandHandler.start()
    logger.info(`Rafiki Command Handler started`);
    return rafikiCommandHandler
  };
}

export function createApp(
  port: number,
  paymentService: PaymentService,
  remoteIncomingPaymentService: RemoteIncomingPaymentServiceAdapter,
  ilpConnector: IlpConnector,
  msgProducer: IMessageProducer
) {
  const app = fastify();

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

    const id = await paymentService.createIncomingPayment({
      id: requestBody.id,
      expiresAt: requestBody.expiresAt,
      incomingAmount: requestBody.incomingAmount
        ? {
            assetCode: requestBody.incomingAmount.assetCode,
            assetScale: requestBody.incomingAmount.assetScale,
            value: BigInt(requestBody.incomingAmount.value),
          }
        : undefined,
      walletAddressId: requestBody.walletAddressId,
    });

    const ilpDetails = ilpConnector.getIlpDetails();

    reply.code(201).send({ id, ilpDetails });
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
          value: BigInt(requestBody.debitAmount.value),
        }
        : undefined,
      receiveAmount: requestBody.receiveAmount
        ? {
          assetCode: requestBody.receiveAmount.assetCode,
          assetScale: requestBody.receiveAmount.assetScale,
          value: BigInt(requestBody.receiveAmount.value),
        }
        : undefined,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      incomingPaymentId: requestBody.incomingPaymentId,
    }
    const id = await paymentService.createQuote(payload);

    await msgProducer.send(new CreateQuoteCmd(payload))
    // TODO: wait for remote quote to complete if necessary

    reply.code(201).send({ id });
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const id = await paymentService.createOutgoingPaymentFromQuote({
      id: requestBody.id,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      quoteId: requestBody.quoteId,
    });

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

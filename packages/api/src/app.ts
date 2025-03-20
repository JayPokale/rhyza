import fastify, {FastifyReply} from "fastify";
import logger from "./logger";
import {
  PaymentService,
  RemoteIncomingPaymentService,
  IlpConnector
} from "payments-service";

import {
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from "payments-service/dist/message-broker/message";
import os from 'os';
import {
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentFromQuoteCmd,
  CreateQuoteCmd,
  Topic
} from "payments-service/dist/message-broker/command";
import {randomUUID} from "node:crypto";
import {
  ApiRspErrorEvent,
  ApiRspErrorPayload,
  ApiRspEventPayload,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent
} from "payments-service/dist/message-broker/event";
import {deprecate} from "node:util";

export function createApp(
  port: number,
  paymentService: PaymentService,
  remoteIncomingPaymentService: RemoteIncomingPaymentService,
  ilpConnector: IlpConnector,
  msgProducer: IMessageProducer,
  msgConsumer: IMessageConsumer
) {
  const mapRsp: Map<string, FastifyReply> = new Map()
  const app = fastify();

  const rafikiApiRsp = new RafikiApiResponseEventHandler(msgConsumer, mapRsp, ilpConnector)
  const initRafikiApiRsp = async () => {
    logger.info(`🥺🥺🥺 Starting Rafiki API Handler::: ->`);
    await rafikiApiRsp.start()
    logger.info(`🥋🥋🥋 Rafiki API Handler started`)
  }
  initRafikiApiRsp()

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

    logger.debug(`API(${os.hostname()}): JASON: Sending incoming-payment to be processed by Rafiki: ${JSON.stringify(payload)}`)

    const cmd = new CreateIncomingPaymentCmd(payload, randomUUID())
    mapRsp.set(cmd.requestId!, reply)
    await msgProducer.send(cmd)
    return reply
  });

  app.post("/remote-incoming-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const url = new URL(requestBody.walletAddressUrl);
    const resourceServerUrl = url.origin;
    const walletAddressId = url.pathname.slice(1);

    const id = await remoteIncomingPaymentService.createRemoteIncomingPayment({
      expiresAt: requestBody.expiresAt,
      walletAddressId,
      incomingAmount: requestBody.incomingAmount
        ? {
            assetCode: requestBody.incomingAmount.assetCode,
            assetScale: requestBody.incomingAmount.assetScale,
            value: BigInt(requestBody.incomingAmount.value),
          }
        : undefined,
      resourceServerUrl,
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

    logger.debug(`API(${os.hostname()}): JASON: Sending quote to be processed by Rafiki: ${JSON.stringify(payload)}`)

    const cmd = new CreateQuoteCmd(payload, randomUUID())
    mapRsp.set(cmd.requestId!, reply)
    await msgProducer.send(cmd)
    return reply
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const requestBody = request.body as any;

    const payload = {
      id: requestBody.id,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      quoteId: requestBody.quoteId,
    }

    const cmd = new CreateOutgoingPaymentFromQuoteCmd(payload, randomUUID())
    mapRsp.set(cmd.requestId!, reply)
    await msgProducer.send(cmd)
    return reply
  });

  app.post("/ilp", async function handler(request, reply) {
    logger.debug("Received prepare packet");

    await ilpConnector.handlePreparePacket(
      request.headers["request-id"] as string,
      request.headers["from-peer"] as string,
      request.body as Buffer
    );

    reply.code(201).send();
  });

  app.post("/ilp-reply", async function handler(request, reply) {
    logger.debug("Received reject or fulfill packet");

    await ilpConnector.handleFulfillOrRejectPacket(
      request.headers["request-id"] as string,
      request.body as Buffer
    );

    reply.code(201).send();
  });

  return async () => {
    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`Listening on port '${port}' 🕹`);
  };
}

class RafikiApiResponseEventHandler {
  private _messageConsumer: IMessageConsumer
  private _rspMap: Map<string, FastifyReply>
  private _ilpConnector: IlpConnector

  constructor(
    messageConsumer: IMessageConsumer,
    rspMap: Map<string, FastifyReply>,
    ilpConnector: IlpConnector
  ) {
    this._messageConsumer = messageConsumer
    this._rspMap = rspMap
    this._ilpConnector = ilpConnector
  }

  async start(): Promise<void> {
    this._messageConsumer.setTopics([Topic.ApiRequest])
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this))
    await this._messageConsumer.connect()
    await this._messageConsumer.startAndWaitForRebalance()
  }

  async stop():Promise<void>{
    await this._messageConsumer.stop()
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug(`Got message in RafikiApiResponseEventHandler with name: ${message.msgName}:${message.requestId}`)
      logger.debug(`Event(${os.hostname()}): JASON: EventReceived: ${JSON.stringify(message)}`)
      try {
        const reply = (message.requestId) ?
          this._rspMap.get(message.requestId) as FastifyReply : undefined

        if (!reply) {
          logger.debug(`Event(${os.hostname()}): JASON: No event found for ${message.requestId}. Ignoring.`)
          return
        }

        switch (message.msgName) {
          case ApiRspIncomingPaymentEvent.name: {
            const payload = message.payload as ApiRspEventPayload
            const ilpDetails = this._ilpConnector.getIlpDetails()
            if (reply) reply.code(200).send({ id : payload.createdId, ilpDetails });
            break
          }
          case ApiRspQuoteEvent.name: {
            const payloadOther = message.payload as ApiRspEventPayload
            if (reply) reply.code(200).send({ id : payloadOther.createdId});
            break
          }
          case ApiRspOutgoingPaymentEvent.name: {
            const payloadOut = message.payload as ApiRspEventPayload
            if (reply) reply.code(200).send({ id : payloadOut.createdId});
            break
          }
          case ApiRspErrorEvent.name: {
            const payloadErr = message.payload as ApiRspErrorPayload
            if (reply) reply.code(500).send(payloadErr);
            break
          }
          default: {
            logger.warn(`RafikiApiResponseEventHandler - unknown event - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`)
          }
        }
        this._rspMap.delete(message.requestId as string)
      } catch (err) {
        logger.error(`RafikiApiResponseEventHandler - processing event - ${message?.msgName}:${message?.msgKey}:${message?.msgId} - Error: ${(err as Error)?.message?.toString()}`, err)
        logger.error(err)
        logger.error("Payload for error:")
        logger.error(message)
      } finally {
        resolve()
      }
    })
  }

  /**@deprecated Use standard reply.code(code).send(payload) instead.
   *
   * Sends a raw HTTP response using Fastify's raw response object.
   * Logs the payload and response details during the process.
   *
   * @param {FastifyReply} reply - The Fastify reply object used for sending the response.
   * @param {number} code - The HTTP status code for the response.
   * @param {any} payload - The response payload to be sent as JSON.
   * @return {Promise<void>} Resolves when the response has been sent successfully.
   *
   */
  private async _fastlyRespond(reply: FastifyReply, code: number, payload: any) {
    logger.info(`Fastly is treating it as raw ${JSON.stringify(payload)}`)
    const res = reply.raw;

    // Set up initial response headers manually.
    res.writeHead(code, {
      'Content-Type': 'application/json',
    });
    res.write(JSON.stringify(payload));
    res.end();
    logger.info(`Fastly has responded with ${JSON.stringify(payload)}`)
  }
}


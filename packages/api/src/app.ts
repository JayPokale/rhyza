import fastify, { FastifyReply } from "fastify";
import { fastifyOtelInstrumentation } from "./telemetry";
import logger from "./logger";
import {
  RemoteIncomingPaymentService,
  IlpConnector,
} from "payments-service/dist/public";
import { TelemetryService } from "telemetry";

import {
  IMessage,
  IMessageConsumer,
  IMessageProducer,
} from "payments-service/dist/message-broker/message";
import os from "os";
import {
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentCmd,
  CreateQuoteCmd,
} from "payments-service/dist/message-broker/command";
import { Topic } from "payments-service/dist/message-broker/event";
import { randomUUID } from "node:crypto";
import {
  ApiRspErrorEvent,
  ApiRspErrorPayload,
  ApiRspEventPayload,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent,
} from "payments-service/dist/message-broker/event";
import { Attributes } from "@opentelemetry/api";

type TimerFunction = (additionalAttributes?: Attributes) => void

interface ApiReqCacheData {
  fastifyReply: FastifyReply
  timer: TimerFunction
}

export function createApp(
  port: number,
  remoteIncomingPaymentService: RemoteIncomingPaymentService,
  ilpConnector: IlpConnector,
  telemetryService: TelemetryService,
  msgProducer: IMessageProducer,
  msgConsumer: IMessageConsumer
) {
  const mapRsp: Map<string, ApiReqCacheData> = new Map();
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

  app.register(fastifyOtelInstrumentation.plugin());

  app.post("/incoming-payment", async function handler(request, reply) {
    const stopTimerReqRsp = telemetryService.startTimer(
      'api_incoming_payment_ms',
      {
        callName: 'Api:internalApiProcessIncomingPayment',
        description: 'Internal time to process an incoming payment request.'
      }
    )

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
    };

    logger.debug(
      { payload },
      `API(${os.hostname()}): Sending incoming-payment`
    );

    const cmd = new CreateIncomingPaymentCmd(payload, randomUUID());
    mapRsp.set(cmd.requestId!, {
      fastifyReply: reply,
      timer: stopTimerReqRsp
    });
    const stopTimerPublish = telemetryService.startTimer(
      'api_incoming_payment_publish_ms',
      {
        callName: 'Api:publishIncomingPayment',
        description: 'Internal time to publish an incoming payment request to the message broker.'
      }
    )
    await msgProducer.send(cmd);
    stopTimerPublish()
    telemetryService.incrementCounter("api_incoming_payment_received", 1)
    telemetryService.incrementCounter("api_received", 1)
    return reply;
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
    const stopTimerReqRsp = telemetryService.startTimer(
      'api_quote_ms',
      {
        callName: 'Api:internalApiProcessQuote',
        description: 'Internal time to process a quote request.'
      }
    )

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
    };

    logger.debug({ payload }, `API(${os.hostname()}): Sending quote`);

    const cmd = new CreateQuoteCmd(payload, randomUUID());
    mapRsp.set(cmd.requestId!, {
      fastifyReply: reply,
      timer: stopTimerReqRsp
    });
    const stopTimerPublish = telemetryService.startTimer(
      'api_quote_publish_ms',
      {
        callName: 'Api:publishQuote',
        description: 'Internal time to publish a quote request to the message broker.'
      }
    )
    await msgProducer.send(cmd);
    stopTimerPublish()
    telemetryService.incrementCounter("api_quote_received", 1)
    telemetryService.incrementCounter("api_received", 1)
    return reply;
  });

  app.post("/outgoing-payment", async function handler(request, reply) {
    const stopTimerReqRsp = telemetryService.startTimer(
      'api_outgoing_payment_ms',
      {
        callName: 'Api:internalApiProcessOutgoingPayment',
        description: 'Internal time to process an outgoing payment request.'
      }
    )

    const requestBody = request.body as any;

    const payload = {
      id: requestBody.id,
      senderWalletAddressId: requestBody.senderWalletAddressId,
      incomingPaymentId: requestBody.incomingPaymentId,
      quoteId: requestBody.quoteId,
      debitAmount: requestBody.debitAmount,
      receiveAmount: requestBody.receiveAmount,
    };

    logger.debug(
      { payload },
      `API(${os.hostname()}): Sending outgoing-payment`
    );

    const cmd = new CreateOutgoingPaymentCmd(payload, randomUUID());
    mapRsp.set(cmd.requestId!, {
      fastifyReply: reply,
      timer: stopTimerReqRsp
    });
    const stopTimerPublish = telemetryService.startTimer(
      'api_outgoing_payment_publish_ms',
      {
        callName: 'Api:publishOutgoingPayment',
        description: 'Internal time to publish an outgoing payment request to the message broker.'
      }
    )
    await msgProducer.send(cmd);
    stopTimerPublish()
    telemetryService.incrementCounter("api_outgoing_payment_received", 1)
    telemetryService.incrementCounter("api_received", 1)
    return reply;
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
    const rafikiApiRsp = new RafikiApiResponseEventHandler(
      msgConsumer,
      mapRsp,
      ilpConnector,
      telemetryService
    );
    await rafikiApiRsp.start();
    logger.info(`🥋🥋🥋 Rafiki API Event Handler started`);

    await app.listen({ port, host: "0.0.0.0" });
    logger.info(`🕹🕹🕹 API Listening on port '${port}'`);
  };
}

class RafikiApiResponseEventHandler {
  constructor(
    private _messageConsumer: IMessageConsumer,
    private _rspMap: Map<string, ApiReqCacheData>,
    private _ilpConnector: IlpConnector,
    private _telemetryService: TelemetryService
  ) {}

  async start(): Promise<void> {
    this._messageConsumer.setTopics([Topic.ApiResponseEvents]);
    this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
    await this._messageConsumer.connect();
    await this._messageConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._messageConsumer.stop();
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug({ message }, `Event(${os.hostname()}): EventReceived`);
      const reply = message.requestId
        ? this._rspMap.get(message.requestId)
        : undefined;
      try {
        if (!reply) {
          logger.debug(
            `Event(${os.hostname()}): No event found for ${
              message.requestId
            }. Ignoring.`
          );
          return;
        }

        switch (message.msgName) {
          case ApiRspIncomingPaymentEvent.name: {
            const payload = message.payload as ApiRspEventPayload;
            const ilpDetails = this._ilpConnector.getIlpDetails();
            await reply.fastifyReply.code(200).send({ id: payload.createdId, ilpDetails });
            break;
          }
          case ApiRspQuoteEvent.name: {
            const payloadOther = message.payload as ApiRspEventPayload;
            this._telemetryService.incrementCounter(
              "outgoing_payment_create_api_replies",
              1
            );
            await reply.fastifyReply.code(200).send({ id: payloadOther.createdId });
            break;
          }
          case ApiRspOutgoingPaymentEvent.name: {
            const payloadOut = message.payload as ApiRspEventPayload;
            await reply.fastifyReply.code(200).send({ id: payloadOut.createdId });
            break;
          }
          case ApiRspErrorEvent.name: {
            const payloadErr = message.payload as ApiRspErrorPayload;
            await reply.fastifyReply.code(500).send(payloadErr);
            break;
          }
          default: {
            logger.warn(
              `RafikiApiResponseEventHandler - unknown event - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`
            );
          }
        }
        this._rspMap.delete(message.requestId as string);
      } catch (err) {
        logger.error(
          `RafikiApiResponseEventHandler - processing event - ${
            message?.msgName
          }:${message?.msgKey}:${message?.msgId} - Error: ${(
            err as Error
          )?.message?.toString()}`,
          err
        );
        logger.error(err);
        logger.error("API -> Payload for error:");
        logger.error(message);
      } finally {
        if (reply) reply.timer()

        resolve();
      }
    });
  }
}

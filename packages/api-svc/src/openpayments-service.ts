/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import {
    ApiRspErrorEvent, ApiRspErrorPayload,
    ApiRspEventPayload,
    ApiRspIncomingPaymentEvent, ApiRspOutgoingPaymentEvent, ApiRspQuoteEvent,
    Attributes,
    CreateIncomingPaymentCmd,
    CreateOutgoingPaymentCmd,
    CreateQuoteCmd, EventTopics,
    ILogger, IMessage, IMessageConsumer,
    IMessageProducer,
    ITelemetryService
} from "common-types-lib";
import {FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest} from "fastify";
import {logger} from "implementations-lib";
import os from "os";
import {randomUUID} from "node:crypto";
import {IRemoteIncomingPaymentService, RemoteIncomingPaymentService} from "payments-domain-lib";

type TimerFunction = (additionalAttributes?: Attributes) => void;

interface ApiReqCacheData {
    fastifyReply: FastifyReply;
    timer: TimerFunction;
}

const TELEMETRY_API_HISTOGRAM_NAME = "api_requests";

export class OpenPaymentsApiService {
    private _logger: ILogger;
    private _router: FastifyInstance | undefined;
    private _telemetryService: ITelemetryService;
    private _msgProducer: IMessageProducer;
    private _msgConsumer: IMessageConsumer;
    private _remoteIncomingPaymentService: IRemoteIncomingPaymentService;
    private _responseMap: Map<string, ApiReqCacheData>

    public constructor(
        logger: ILogger,
        msgProducer: IMessageProducer,
        msgConsumer: IMessageConsumer,
        remoteIncomingPaymentService: IRemoteIncomingPaymentService,
        telemetryService: ITelemetryService,
    ) {
        this._logger = logger;
        this._telemetryService = telemetryService;
        this._msgProducer = msgProducer;
        this._msgConsumer = msgConsumer;
        this._remoteIncomingPaymentService = remoteIncomingPaymentService;
        this._responseMap = new Map<string, ApiReqCacheData>();
    }

    public async init(): Promise<void> {
        //await this._router.ready();

        this._msgConsumer.setTopics([EventTopics.ApiResponseEvents]);
        // this._msgConsumer.setCallbackFn(this._msgHandler.bind(this));
        this._msgConsumer.setBatchCallbackFn(this._msgBatchHandler.bind(this));
        await this._msgConsumer.connect();
        await this._msgConsumer.startAndWaitForRebalance();

        return Promise.resolve();
    }

    public async destroy(): Promise<void> {
        if(this._router) await this._router.close();

        return Promise.resolve();
    }

    public bindRoutes(fastify: FastifyInstance, options: FastifyPluginOptions):void {
        this._router = fastify;

        this._router.post("/incoming-payment", this._handleIncomingPayment.bind(this));
        this._router.post("/remote-incoming-payment", this._handleRemoteIncomingPayment.bind(this));
        this._router.post("/quote", this._handleQuote.bind(this));
        this._router.post("/outgoing-payment", this._handleOutgoingPayment.bind(this));
    }

    private _startTimer(callname:string):(additionalAttributes?: Attributes)=>void{
        return this._telemetryService.startTimer(
            TELEMETRY_API_HISTOGRAM_NAME,
            {
                callName: callname
            }
        );
    }

    private async _handleIncomingPayment(request: FastifyRequest, reply: FastifyReply):Promise<never> {
        const stopTimerReqRsp = this._startTimer("HandleIncomingPayment");

        const requestBody = request.body as any;

        const payload = {
            id: requestBody.id || crypto.randomUUID(),
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

        logger.debug( `API(${os.hostname()}): publishing incoming-payment`);

        const cmd = new CreateIncomingPaymentCmd(payload, randomUUID());
        this._responseMap.set(cmd.requestId!, {
            fastifyReply: reply,
            timer: stopTimerReqRsp,
        });

        const stopTimerPublish = this._startTimer("PublishMsg_CreateIncomingPaymentCmd");

        await this._msgProducer.send(cmd);
        stopTimerPublish();
        this._telemetryService.incrementCounter("api_incoming_payment_received", 1);
        this._telemetryService.incrementCounter("api_received", 1);

        // await wait(ARTIFICIAL_AWAIT_TIME_MS, () => {
        //   const reply = this._responseMap.get(cmd.requestId!)!;
        //
        //   reply.fastifyReply.code(200).send({ id: payload.id });
        //   this._responseMap.delete(cmd.requestId!);
        // });

        return reply;
    }

    private async _handleRemoteIncomingPayment(request: FastifyRequest, reply: FastifyReply):Promise<void> {
        const stopTimerReqRsp = this._startTimer("HandleRemoteIncomingPayment");

        const requestBody = request.body as any;

        const url = new URL(requestBody.walletAddressUrl);
        const resourceServerUrl = url.origin;
        const walletAddressId = url.pathname.slice(1);

        // TODO change to command

        const id = await this._remoteIncomingPaymentService.createRemoteIncomingPayment({
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

        reply.code(201).send({id})

        stopTimerReqRsp();
    }

    private async _handleQuote(request: FastifyRequest, reply: FastifyReply):Promise<never> {
        const stopTimerReqRsp = this._startTimer("HandleQuote");

        const requestBody = request.body as any;

        // TODO: As an enhancement, we can allow the client to specify whether they want back a 202
        // to just be able to fetch the quote later (async mode)
        const payload = {
            id: requestBody.id || crypto.randomUUID(),
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

        logger.debug(`API(${os.hostname()}): Publishing quote`);

        const cmd = new CreateQuoteCmd(payload, randomUUID());
        this._responseMap.set(cmd.requestId!, {
            fastifyReply: reply,
            timer: stopTimerReqRsp,
        });

        const stopTimerPublish = this._startTimer("PublishMsg_CreateQuoteCmd");
        await this._msgProducer.send(cmd);
        stopTimerPublish();

        // await wait(ARTIFICIAL_AWAIT_TIME_MS, () => {
        //   const reply = this._responseMap.get(cmd.requestId!)!;
        //
        //   reply.fastifyReply.code(200).send({ id: payload.id });
        //   this._responseMap.delete(cmd.requestId!);
        // });

        return reply;
    }

    private async _handleOutgoingPayment(request: FastifyRequest, reply: FastifyReply):Promise<never> {
        const stopTimerReqRsp = this._startTimer("HandleOutgoingPayment");

        const requestBody = request.body as any;

        const payload = {
            id: requestBody.id,
            senderWalletAddressId: requestBody.senderWalletAddressId,
            // outgoing payment can be created from EITHER quote OR incoming payment,
            // but incomingPaymentId is required for proper partitioning
            incomingPaymentId: requestBody.incomingPaymentId,
            quoteId: requestBody.quoteId,
            debitAmount: requestBody.debitAmount,
        };

        logger.debug(`API(${os.hostname()}): Publishing outgoing-payment`);

        const cmd = new CreateOutgoingPaymentCmd(payload, randomUUID());
        this._responseMap.set(cmd.requestId!, {
            fastifyReply: reply,
            timer: stopTimerReqRsp,
        });

        const stopTimerPublish = this._startTimer("PublishMsg_CreateOutgoingPaymentCmd");
        await this._msgProducer.send(cmd);
        stopTimerPublish();

        // await wait(ARTIFICIAL_AWAIT_TIME_MS, () => {
        //   const reply = this._responseMap.get(cmd.requestId!)!;
        //
        //   reply.fastifyReply.code(200).send({ id: requestBody.id });
        //   this._responseMap.delete(cmd.requestId!);
        // });

        return reply;
    }


    private async _msgBatchHandler(messages: IMessage[]): Promise<void> {
        logger.debug(`Event(${os.hostname()}): ${messages.length} Commands received in batch handler`);

        this._telemetryService.updateGauge("ConsumerBatchSize", messages.length);

        for(const msg of messages) {
            await this._msgHandler(msg);
        }
    }

    private async _msgHandler(message: IMessage): Promise<void> {
        //logger.debug({message}, `Event(${os.hostname()}): EventReceived`);

        const reply = this._responseMap.get(message.requestId as string);
        if (!reply) {
            logger.debug(
                `Event(${os.hostname()}): No pending response found for requestId: ${
                    message.requestId
                }. Ignoring.`
            );
            return;
        }

        if(message.msgTimestamp){
            const msgDelay = Date.now() - message.msgTimestamp;
            this._telemetryService.recordHistogram("outgoing_payment_create_api_replies", msgDelay, {callName: "msgDelay"});
        }

        try {
            switch (message.msgName) {
                case ApiRspIncomingPaymentEvent.name: {
                    const payload = message.payload as ApiRspEventPayload;
                    // TODO where should this come from, a full ilpconnector doesn't make sense
                    // const ilpDetails = this._ilpConnector.getIlpDetails();
                    const ilpDetails = {};
                    await reply.fastifyReply
                        .code(200)
                        .send({id: payload.createdId, ilpDetails});
                    break;
                }
                case ApiRspQuoteEvent.name: {
                    const payloadOther = message.payload as ApiRspEventPayload;
                    await reply.fastifyReply
                        .code(200)
                        .send({id: payloadOther.createdId});
                    break;
                }
                case ApiRspOutgoingPaymentEvent.name: {
                    const payloadOut = message.payload as ApiRspEventPayload;
                    this._telemetryService.incrementCounter(
                        "outgoing_payment_create_api_replies",
                        1
                    );
                    await reply.fastifyReply
                        .code(200)
                        .send({id: payloadOut.createdId});
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
            this._responseMap.delete(message.requestId as string);
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
            if (reply) reply.timer();
        }

    }
}

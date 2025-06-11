/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import {
    ILogger,
    ITelemetryService
} from "common-types-lib";
import {FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest} from "fastify";
import {logger} from "implementations-lib";
import {IlpConnector} from "payments-domain-lib";


export class IlpApiService {
    private _logger: ILogger;
    private _router: FastifyInstance | undefined;
    private _telemetryService: ITelemetryService;
    private _ilpConnector: IlpConnector;
    

    public constructor(
        logger: ILogger,
        ilpConnector: IlpConnector,
        telemetryService: ITelemetryService,
    ) {
        this._logger = logger;
        this._telemetryService = telemetryService;
        this._ilpConnector = ilpConnector;
    }
    
    public async init(): Promise<void> {
        //await this._router.ready();
       
        return Promise.resolve();
    }

    public async destroy(): Promise<void> {
        if(this._router) await this._router.close();
        
        return Promise.resolve();
    }
    
    public bindRoutes(fastify: FastifyInstance, options: FastifyPluginOptions):void {
        this._router = fastify;
        
        this._router.post("/ilp", this._handleIlp.bind(this));
        this._router.post("/ilp-reply", this._handleIlpReply.bind(this));
    }
    
    
    private async _handleIlp(request: FastifyRequest, reply: FastifyReply) {
        logger.debug("Received prepare packet");

        await this._ilpConnector.handlePreparePacket(
            request.headers["request-id"] as string,
            request.headers["from-peer"] as string,
            request.body as Buffer
        );

        reply.code(201).send();
    }

    private async _handleIlpReply(request: FastifyRequest, reply: FastifyReply){
        logger.debug("Received reject or fulfill packet");

        await this._ilpConnector.handleFulfillOrRejectPacket(
            request.headers["request-id"] as string,
            request.body as Buffer
        );

        reply.code(201).send();
    }
    
}
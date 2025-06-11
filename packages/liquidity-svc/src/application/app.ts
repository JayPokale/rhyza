/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

// must be first import

// import {fastifyOtelInstrumentation} from "../telemetry";
import {OpenTelemetryServiceClient, TelemetryService} from "implementations-lib";

import process from "process";
import Fastify, {
    FastifyInstance, FastifyReply, FastifyRequest,
} from "fastify";
import {TigerbeetleAdapter} from "../implementations/tigerbeetle/tigerbeetle-adapter";
import {
    IAssetAccountRepository,
    ILedgerService,
    IPeerAccountRepository,
    IWalletAddressAccountRepository
} from "../domain/interfaces";
import {PostgresPool, logger} from "implementations-lib";
import {LiquidityDomainService} from "../domain";
import {AssetAccountPsqlRepository} from "../implementations/asset-account-psql-repo";
import {PeerAccountPsqlRepository} from "../implementations/peeraccount-psql-repo";
import {WalletAddressAccountPsqlRepository} from "../implementations/walletaddress-acount-psql-repo";
import {LiquidityFastifyRouter} from "./fastify-router";
import {ITelemetryService} from "common-types-lib";

const INSTANCE_ID = crypto.randomUUID();

// ENV VARS for configuration
const SERVICE_START_TIMEOUT_MS = (process.env["SERVICE_START_TIMEOUT_MS"] && parseInt(process.env["SERVICE_START_TIMEOUT_MS"])) || 60_000;
const OPEN_TELEMETRY_COLLECTOR_URL = process.env["OPEN_TELEMETRY_COLLECTOR_URL"] || "http://otel-collector:4317";
const API_PORT = (process.env["API_PORT"] && parseInt(process.env["API_PORT"])) || 3001;

const TB_CLUSTER_ID = (process.env["TB_CLUSTER_ID"]!=undefined && parseInt(process.env["TB_CLUSTER_ID"])) || 0;
const TB_CLUSTER_REPLICA_ADDRESSES = process.env["TB_CLUSTER_REPLICA_ADDRESSES"] || "localhost:13000";

export class LiquidityRestServiceApp {
    private static startupTimer: NodeJS.Timeout;
    private static app: FastifyInstance;
    private static telemetryService:ITelemetryService;
    private static assetAccountRepository:IAssetAccountRepository;
    private static peerAccountRepository:IPeerAccountRepository;
    private static walletAddressAccountRepository:IWalletAddressAccountRepository;
    private static ledgerServiceClient:ILedgerService;

    private static liquidityDomainService:LiquidityDomainService;

    // all params in the start are mock'able
    // only adapters or clients, never the domain
    // pass no params to start in default/prod mode
    static async start(
        telemetryService?:ITelemetryService,
        assetAccountRepository?:IAssetAccountRepository,
        peerAccountRepository?:IPeerAccountRepository,
        walletAddressAccountRepository?:IWalletAddressAccountRepository,
        ledgerServiceClient?:ILedgerService
    ):Promise<void>{
        console.log(`Service starting with PID: ${process.pid}`);
        this.startupTimer = setTimeout(() => {
            throw new Error("Service start timed-out");
        }, SERVICE_START_TIMEOUT_MS);

        if (!telemetryService) {
            OpenTelemetryServiceClient.Start("rafiki-poc", "liquidity-svc","0.0.1", INSTANCE_ID, logger, OPEN_TELEMETRY_COLLECTOR_URL);

            telemetryService = OpenTelemetryServiceClient.getInstance();
        }
        this.telemetryService = telemetryService;

        // initialise the repositories if not provided
        if(!assetAccountRepository){
            assetAccountRepository = new AssetAccountPsqlRepository(PostgresPool, logger);
        }
        this.assetAccountRepository = assetAccountRepository;

        if(!peerAccountRepository){
            peerAccountRepository = new PeerAccountPsqlRepository(PostgresPool, logger);
        }
        this.peerAccountRepository = peerAccountRepository;

        if(!walletAddressAccountRepository){
            walletAddressAccountRepository = new WalletAddressAccountPsqlRepository(PostgresPool, logger);
        }
        this.walletAddressAccountRepository = walletAddressAccountRepository;

        // initialise the ledger client if not provided
        if(!ledgerServiceClient){
            ledgerServiceClient = new TigerbeetleAdapter(TB_CLUSTER_ID, TB_CLUSTER_REPLICA_ADDRESSES, logger);
            await ledgerServiceClient.init();
        }
        this.ledgerServiceClient = ledgerServiceClient;


        // initialise the domain service - DOMAIN CODE CAN NEVER BE MOCKED
        this.liquidityDomainService = new LiquidityDomainService(
            this.assetAccountRepository,
            this.peerAccountRepository,
            this.walletAddressAccountRepository,
            this.ledgerServiceClient,
            this.telemetryService
        );

        // fastify stuff
        await this.setupFastify();

        // remove startup timeout
        clearTimeout(this.startupTimer);
    }

    static async stop():Promise<void>{
        /* NOTE
        * Stop any adapters or clients that require graceful shutdown or disconnect here.
        * First stop the driving adapters or services like consumers or webservers,
        * so the ingestion of new requests stops.
        * */

        if (this.app) {
            logger.info("Tearing down fastify server");
            await this.app.close();
        }
    }

    static async setupFastify(): Promise<void> {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (resolve) => {
            this.app = Fastify({
                logger: false,
            });

            this.app.get("/health", (req:FastifyRequest, reply:FastifyReply)=>{
                return reply.send({});
            });

            if(OpenTelemetryServiceClient.getInstance()) {
                const telemetryClient= OpenTelemetryServiceClient.getInstance() as  OpenTelemetryServiceClient;
                if(telemetryClient.fastifyOtelInstrumentation) {
                    this.app.register(telemetryClient.fastifyOtelInstrumentation.plugin());
                }
            }

            const router = new LiquidityFastifyRouter(
                logger,
                this.telemetryService,
                this.liquidityDomainService
            );

            // mount and init specific routes
            this.app.register(router.bindRoutes.bind(router), {prefix: "/"});
            await router.init();

            this.app.listen({host:"0.0.0.0", port: API_PORT }, (err, address) => {
                if (err) {
                    console.error(err);
                    throw err;
                }
                logger.info(`🕹🕹🕹 Liquidity API ready and Listening on address '${address}'`);
                resolve();
            });
        });
    }
}


/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
    console.info(`Service - ${signal} received - cleaning up...`);
    let clean_exit = false;
    setTimeout(() => {
        clean_exit || process.exit(99);
    }, 5000);

    // call graceful stop routine
    await LiquidityRestServiceApp.stop();

    clean_exit = true;
    process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when app is closing
process.on("exit", async () => {
    console.info("Microservice - exiting...");
});
process.on("uncaughtException", (err: Error) => {
    console.error(err);
    console.log("UncaughtException - EXITING...");
    process.exit(999);
});

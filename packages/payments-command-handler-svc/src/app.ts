"use strict";
//require("./telemetry.js"); // Load telemetry before running the rest of the app
import {OpenTelemetryServiceClient } from "implementations-lib";


import process from "process";
import Redis from "ioredis";
import {readFileSync} from "fs";

import {
    PostgresPool,
    logger,
    TelemetryService,
    WalletAddressPsqlRepository,
    RedisCache,
    LiquidityServiceClient,
    AssetPsqlRepository,
    IlpPeerPsqlRepository,
    InMemoryCache,
    RemoteIncomingPaymentPsqlRepository,
    OutgoingPaymentPsqlRepository,
    IncomingPaymentPsqlRepository,
    QuotePsqlRepository,
    LocalEventEmitterPubSub,
    RafikiKafkaJsonConsumerOptions,
    RafikiKafkaJsonProducerOptions,
    RafikiKafkaJsonConsumer, RafikiKafkaJsonProducer
} from "implementations-lib";
import {
    ICache, ILocalEventConsumerAdapter,
    ILocalEventProducerAdapter,
    ILogger,
    IMessageConsumer,
    IMessageProducer,
    ITelemetryService,
    WalletAddress
} from "common-types-lib";

import {
    IAssetRepository,
    IIncomingPaymentRepository,
    ILiquidityService,
    IlpPeer,
    IlpPeerService,
    IOutgoingPaymentRepository,
    IQuoteRepository,
    IWalletAddressRepository,
    PaymentDomainService,
    IRatesServiceAdapter,
    WalletAddressService,
    RatesService,
    IRemoteIncomingPaymentRepository,
    RemoteIncomingPayment,
    RemoteIncomingPaymentService,
    IncomingPayment,
    OutgoingPayment,
    Quote,
    PaymentEventType,
    IlpConnector,
    IIlpConnector,
    IAssetService, AssetService, IIlpPeerRepository
} from "payments-domain-lib";

import {PaymentsCommandHandler} from "./cmd-handler";

const INSTANCE_ID = crypto.randomUUID();

// ENV VARS for configuration
const ILP_CONFIG_OWN_ADDRESS = process.env["ILP_CONFIG_OWN_ADDRESS"] || "test.peer-a";

const SERVICE_START_TIMEOUT_MS = (process.env["SERVICE_START_TIMEOUT_MS"] && parseInt(process.env["SERVICE_START_TIMEOUT_MS"])) || 60_000;
const OPEN_TELEMETRY_COLLECTOR_URL = process.env["OPEN_TELEMETRY_COLLECTOR_URL"] || "http://otel-collector:4317";
const LIQUIDITY_SERVICE_URL = process.env["LIQUIDITY_SERVICE_URL"] || "http://localhost:3001";
const REDIS_URL = process.env["REDIS_URL"] || "127.0.0.1:6379";

// Message Consumer/Publisher
const KAFKA_URL = process.env["KAFKA_URL"] || "localhost:9092";
const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

// kafka common options
const kafkaProducerCommonOptions:RafikiKafkaJsonProducerOptions = {
    kafkaBrokerList: KAFKA_URL,
    producerClientId:  `rafiki-cmd-handler-${INSTANCE_ID}`,
};
const kafkaConsumerCommonOptions:RafikiKafkaJsonConsumerOptions ={
    kafkaBrokerList: KAFKA_URL,
    kafkaGroupId: "rafiki-cmd-handler",
    batchSize: 200,
    batchTimeoutMs: 25
};
if(KAFKA_AUTH_ENABLED){
    kafkaProducerCommonOptions.authentication = kafkaConsumerCommonOptions.authentication = {
        protocol: KAFKA_AUTH_PROTOCOL as "plaintext" | "ssl" | "sasl_plaintext" | "sasl_ssl",
        mechanism: KAFKA_AUTH_MECHANISM as "PLAIN" | "GSSAPI" | "SCRAM-SHA-256" | "SCRAM-SHA-512",
        username: KAFKA_AUTH_USERNAME,
        password: KAFKA_AUTH_PASSWORD
    };
}


const ONE_HOUR_IN_MS = 3_600_000;

export class PaymentsServiceApp {
    private static startupTimer: NodeJS.Timeout;
    private static telemetryService:ITelemetryService;
    private static msgProducer: IMessageProducer;
    private static msgConsumer: IMessageConsumer;

    private static walletAddressRepository:IWalletAddressRepository;
    private static assetRepository:IAssetRepository;
    private static ilpPeerRepository:IIlpPeerRepository;
    private static remoteIncomingPaymentRepository:IRemoteIncomingPaymentRepository;
    private static incomingPaymentRepository:IIncomingPaymentRepository;
    private static outgoingPaymentRepository:IOutgoingPaymentRepository;
    private static localEventProducerAdapter:ILocalEventProducerAdapter;
    private static localEventConsumerAdapter:ILocalEventConsumerAdapter;
    private static quoteRepository:IQuoteRepository;

    private static liquidityServiceClient:ILiquidityService;
    private static assetService:IAssetService;
    private static ratesServiceClient:IRatesServiceAdapter;
    private static ilpConnector:IIlpConnector;

    private static walletAddressCacheClient:ICache<WalletAddress>;

    // Domain services
    private static ilpPeerService: IlpPeerService;
    private static remoteIncomingPaymentService: RemoteIncomingPaymentService;
    private static walletAddressService: WalletAddressService;
    private static paymentService: PaymentDomainService;

    // app
    private static commandHandler: PaymentsCommandHandler;

    // all params in the start are mock'able
    // only adapters or clients, never the domain
    // pass no params to start in default/prod mode
    static async start(
        telemetryService?:ITelemetryService,
        msgProducer?: IMessageProducer,
        msgConsumer?: IMessageConsumer,
        walletAddressRepository?:IWalletAddressRepository,
        liquidityServiceClient?:ILiquidityService,
        assetRepository?:IAssetRepository,
        walletAddressCacheClient?:ICache<WalletAddress>,
        ilpPeerPsqlRepository?:IIlpPeerRepository,
        ratesServiceClient?:IRatesServiceAdapter,
        remoteIncomingPaymentRepository?:IRemoteIncomingPaymentRepository,
        incomingPaymentRepository?:IIncomingPaymentRepository,
        outgoingPaymentRepository?:IOutgoingPaymentRepository,
        quoteRepository?:IQuoteRepository,
        localEventProducerAdapter?:ILocalEventProducerAdapter,
        localEventConsumerAdapter?:ILocalEventConsumerAdapter,
        ilpConnector?:IIlpConnector
    ):Promise<void> {
        console.log(`Service starting with PID: ${process.pid}`);
        this.startupTimer = setTimeout(() => {
            throw new Error("Service start timed-out");
        }, SERVICE_START_TIMEOUT_MS);

        // **********************************************************************
        // initialise with defaults all adapters, clients and repositories that were not passed by via params
        // these are the components which will be needed by the domain services below
        // **********************************************************************

        if (!telemetryService) {
            OpenTelemetryServiceClient.Start("rafiki-poc", "command-handler-svc","0.0.1", INSTANCE_ID, logger, OPEN_TELEMETRY_COLLECTOR_URL);

            telemetryService = OpenTelemetryServiceClient.getInstance();
        }
        this.telemetryService = telemetryService;

        if(!msgProducer) {
            msgProducer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions);
            await msgProducer.connect();
        }
        this.msgProducer = msgProducer;

        if(!msgConsumer) {
            msgConsumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions);
        }
        this.msgConsumer = msgConsumer;


        if(!walletAddressCacheClient) {
            const redisClient = new Redis(REDIS_URL);
            walletAddressCacheClient = new RedisCache<WalletAddress>(redisClient, ONE_HOUR_IN_MS, logger);
        }
        this.walletAddressCacheClient = walletAddressCacheClient;

        if(!walletAddressRepository){
            walletAddressRepository = new WalletAddressPsqlRepository(
                this.walletAddressCacheClient,
                PostgresPool,
                logger
            );
        }
        this.walletAddressRepository = walletAddressRepository;

        if(!liquidityServiceClient){
            liquidityServiceClient = new LiquidityServiceClient(LIQUIDITY_SERVICE_URL, logger);
        }
        this.liquidityServiceClient = liquidityServiceClient;

        if(!assetRepository){
            assetRepository = new AssetPsqlRepository(PostgresPool, logger);
        }
        this.assetRepository = assetRepository;

        if(!ilpPeerPsqlRepository){
            ilpPeerPsqlRepository = new IlpPeerPsqlRepository(
                new InMemoryCache<IlpPeer>(ONE_HOUR_IN_MS),
                new InMemoryCache<string>(ONE_HOUR_IN_MS),
                PostgresPool,
                logger
            );
        }
        this.ilpPeerRepository = ilpPeerPsqlRepository;

        if(!ratesServiceClient){
            ratesServiceClient = new RatesService();
        }
        this.ratesServiceClient = ratesServiceClient;

        if(!remoteIncomingPaymentRepository){
            remoteIncomingPaymentRepository = new RemoteIncomingPaymentPsqlRepository(
                new InMemoryCache<RemoteIncomingPayment>(ONE_HOUR_IN_MS),
                PostgresPool,
                logger
            );
        }
        this.remoteIncomingPaymentRepository = remoteIncomingPaymentRepository;

        if(!incomingPaymentRepository){
            incomingPaymentRepository = new IncomingPaymentPsqlRepository(
                new InMemoryCache<IncomingPayment>(ONE_HOUR_IN_MS),
                PostgresPool,
                logger
            );
        }
        this.incomingPaymentRepository = incomingPaymentRepository;

        if(!outgoingPaymentRepository){
            outgoingPaymentRepository = new OutgoingPaymentPsqlRepository(
                new InMemoryCache<OutgoingPayment>(ONE_HOUR_IN_MS),
                PostgresPool,
                logger
            )
        }
        this.outgoingPaymentRepository = outgoingPaymentRepository;

        if(!quoteRepository){
            quoteRepository = new QuotePsqlRepository(
                new InMemoryCache<Quote>(ONE_HOUR_IN_MS),
                PostgresPool,
                logger
            );
        }
        this.quoteRepository = quoteRepository;

        if(!localEventProducerAdapter || !localEventConsumerAdapter){
            localEventProducerAdapter = localEventConsumerAdapter = new LocalEventEmitterPubSub();
        }
        this.localEventConsumerAdapter = localEventConsumerAdapter as ILocalEventConsumerAdapter;
        this.localEventProducerAdapter = localEventProducerAdapter as ILocalEventProducerAdapter;

        if(!ilpConnector){
            ilpConnector = new IlpConnector(
                ILP_CONFIG_OWN_ADDRESS,
                this.ilpPeerService,
                this.localEventProducerAdapter
            );
        }
        this.ilpConnector = ilpConnector;

        // **********************************************************************
        // Domain services initialisation - DOMAIN CODE CAN NEVER BE MOCKED
        // **********************************************************************

        this.assetService = new AssetService(
            this.assetRepository,
            this.liquidityServiceClient
        )

        this.walletAddressService = new WalletAddressService(
            this.walletAddressRepository,
            this.liquidityServiceClient
        );

        this.ilpPeerService = new IlpPeerService(this.ilpPeerRepository, this.liquidityServiceClient);

        this.remoteIncomingPaymentService = new RemoteIncomingPaymentService(
            remoteIncomingPaymentRepository,
            logger
        );

        this.paymentService = new PaymentDomainService(
            this.walletAddressService,
            this.ilpPeerService,
            this.ratesServiceClient,
            this.liquidityServiceClient,
            this.remoteIncomingPaymentService,
            this.incomingPaymentRepository,
            this.outgoingPaymentRepository,
            this.quoteRepository,
            this.localEventProducerAdapter,
            this.telemetryService,
            logger
        );

        // **********************************************************************
        // application service initialisation - CAN NEVER BE MOCKED
        // **********************************************************************

        this.commandHandler = new PaymentsCommandHandler(
            logger,
            this.msgConsumer,
            this.msgProducer,
            this.paymentService,
            this.telemetryService
        );

        await PaymentsServiceApp.hookLocalEvents();

        await PaymentsServiceApp.seed();

        logger.info(`🥺🥺🥺 Starting Rafiki Command Handler::: ->`);
        await this.commandHandler.start();
        logger.info(`🚀🚀🚀 Rafiki Command Handler started`);

        // remove startup timeout
        clearTimeout(this.startupTimer);
    }

    static async hookLocalEvents():Promise<void>{
        // events handled by paymentService
        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
            this.paymentService.handleLocalOutgoingPaymentFundedEvent.bind(this.paymentService)
        );

        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.ILP_QUOTE_PREPARE_PACKET_RECEIVED,
            this.paymentService.handleIlpQuotePacketReceived.bind(this.paymentService)
        );

        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_RECEIVED,
            this.paymentService.handleIlpPaymentPreparePacketReceivedEvent.bind(this.paymentService)
        );

        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.ILP_PAYMENT_FULFILL_PACKET_RECEIVED,
            this.paymentService.handleIlpPaymentFulfillPacketReceivedEvent.bind(this.paymentService)
        );

        // events handled by ilpConnector
        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.REMOTE_QUOTE_REQUESTED,
            this.ilpConnector.handleRemoteQuoteRequestedEvent.bind(this.ilpConnector)
        );

        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED,
            this.ilpConnector.handlePaymentPreparePacketAcceptedEvent.bind(this.ilpConnector)
        );

        await this.localEventConsumerAdapter.registerConsumer(
            PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
            this.ilpConnector.handleRemoteOutgoingPaymentFundedEvent.bind(this.ilpConnector)
        );
    }

    static async seed():Promise<void>{
        // TODO wrap in a control for different env
        const seedFilePath = process.env["SEED_FILE_LOCATION"] || "../../../seed.json";
        logger.info(`Running seed from ${seedFilePath}`);

        const data = readFileSync(seedFilePath, "utf8");
        const seed = JSON.parse(data);

        for (const asset of seed.assets) {
            const exists = await this.assetRepository.existsByCode(asset.code);
            if(exists) continue;

            await this.assetService.createAsset(asset.scale, asset.code);
        }

        for (const walletAddress of seed.walletAddresses) {
            const exists = await this.walletAddressRepository.exists(walletAddress.id);
            if(exists) continue;

            await this.walletAddressService.createWalletAddress(walletAddress);
        }

        for (const peer of seed.peers) {
            const exists = await this.ilpPeerService.getByDestinationAddress(peer.address);
            if(exists) continue;
            await this.ilpPeerService.create(peer);
        }

        // moved to the IlpConnector ctor
        // this.ilpConnector.ownDestinationAddress = seed.ilpConfig.address;

    }



    static async stop():Promise<void>{
        /* NOTE
        * Stop any adapters or clients that require graceful shutdown or disconnect here.
        * First stop the driving adapters or services like consumers or webservers,
        * so the ingestion of new requests stops.
        * */

        await this.commandHandler.stop();
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
    await PaymentsServiceApp.stop();

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

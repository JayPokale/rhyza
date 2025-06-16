"use strict";
//require("./telemetry.js"); // Load telemetry before running the rest of the app
import {
    InMemoryCache,
    LiquidityServiceClient,
    LocalEventEmitterPubSub,
    logger,
    OpenTelemetryServiceClient,
    PostgresPool,
    RafikiKafkaJsonConsumer,
    RafikiKafkaJsonConsumerOptions,
    RafikiKafkaJsonProducer,
    RafikiKafkaJsonProducerOptions
} from "implementations-lib";
import {IlpPeerPsqlRepository} from "implementations-lib/dist/repositories/ilp-peers";
import {
    IlpConnector,
    IlpPeer,
    IlpPeerService,
    RemoteIncomingPayment,
    RemoteIncomingPaymentService
} from "payments-domain-lib";
import {RemoteIncomingPaymentPsqlRepository} from "implementations-lib/dist/repositories/remote-incoming-payments";
import {fastify} from "fastify";
import {OpenPaymentsApiService} from "./openpayments-service";
import {IlpApiService} from "./ilp-service";
import process from "process";
import {RafikiKafkaRawProducerPartitioners} from "implementations-lib/dist/kafka/raw/rdkafka_raw_producer";

// ENV VARS for configuration
const ILP_CONFIG_OWN_ADDRESS = process.env["ILP_CONFIG_OWN_ADDRESS"] || "test.peer-a";

const ONE_HOUR_IN_MS = 3_600_000;

const KAFKA_URL = process.env["KAFKA_URL"] || "kafka:9092";
const LIQUIDITY_SERVICE_URL = process.env["LIQUIDITY_SERVICE_URL"] as string;
const OPEN_TELEMETRY_COLLECTOR_URL = process.env["OPEN_TELEMETRY_COLLECTOR_URL"] || "http://otel-collector:4317";

const API_PORT = (process.env["API_PORT"] && parseInt(process.env["API_PORT"])) || 3000;

const INSTANCE_ID = crypto.randomUUID();

(async () => {
    // Kafka
    const kafkaProducerCommonOptions: RafikiKafkaJsonProducerOptions = {
        kafkaBrokerList: KAFKA_URL,
        producerClientId: `rafiki-api-producer-${INSTANCE_ID}`
    };
    const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
        kafkaBrokerList: KAFKA_URL,
        // Event received by all api instances, but ignored where not applicable:
        kafkaGroupId: `rafiki-api-consumer-${INSTANCE_ID}`,
        batchSize: 500,
        batchTimeoutMs: 50
    };
    logger.info(`Init Kafka on '${KAFKA_URL}'`);

    OpenTelemetryServiceClient.Start("rafiki-poc", "api-svc","0.0.1", INSTANCE_ID, logger, OPEN_TELEMETRY_COLLECTOR_URL);

    // Init Producer/Consumer:
    const msgProducer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions);
    await msgProducer.connect();
    const msgConsumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions);


    // event emiter - TODO change to kafka
    const eventEmitterPubSub = new LocalEventEmitterPubSub();
    // const eventConsumer = eventEmitterPubSub;
    const eventProducer = eventEmitterPubSub;


    const remoteIncomingPaymentRepository = new RemoteIncomingPaymentPsqlRepository(
        new InMemoryCache<RemoteIncomingPayment>(ONE_HOUR_IN_MS),
        PostgresPool,
        logger
    );

    const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
        remoteIncomingPaymentRepository,
        logger
    );

    const ilpPeerRepository = new IlpPeerPsqlRepository(
        new InMemoryCache<IlpPeer>(ONE_HOUR_IN_MS),
        new InMemoryCache<string>(ONE_HOUR_IN_MS),
        PostgresPool,
        logger
    );

    const liquidityService = new LiquidityServiceClient(
        LIQUIDITY_SERVICE_URL,
        logger
    );

    const ilpPeerService = new IlpPeerService(ilpPeerRepository, liquidityService);

    const ilpConnector = new IlpConnector(ILP_CONFIG_OWN_ADDRESS,ilpPeerService, eventProducer);

    // setup fastify
    const app = fastify();

    app.addContentTypeParser( "application/octet-stream",  { parseAs: "buffer"},
        async function (_: any, payload: Buffer) {
            return payload;
        }
    );

    if(OpenTelemetryServiceClient.getInstance()) {
        const telemetryClient= OpenTelemetryServiceClient.getInstance() as  OpenTelemetryServiceClient;
        if(telemetryClient.fastifyOtelInstrumentation) {
            app.register(telemetryClient.fastifyOtelInstrumentation.plugin());
        }
    }

    // instantiate APIs
    const openPaymentsApi = new OpenPaymentsApiService(
        logger,
        msgProducer,
        msgConsumer,
        remoteIncomingPaymentService,
        OpenTelemetryServiceClient.getInstance()
    );

    const ilpApi = new IlpApiService(logger, ilpConnector, OpenTelemetryServiceClient.getInstance());

    app.register(openPaymentsApi.bindRoutes.bind(openPaymentsApi), {prefix: "/"});
    app.register(ilpApi.bindRoutes.bind(ilpApi), {prefix: "/"});

    await openPaymentsApi.init();
    logger.info(`🥋🥋🥋 Rafiki API Event Handler started`);

    await ilpApi.init();

    app.listen({port:API_PORT, host: "0.0.0.0"}, (err, address) => {
        if (err) {
            logger.error(err);
            throw err;
        }

        logger.info(`🕹🕹🕹 API Listening on port '${API_PORT}'`);
    });

})();


process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    // well not really :)
    // TODO: actually exit gracefully, ie, teardown the consumers, repos, etc
    process.exit(0);
});

import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions, RafikiKafkaRawConsumerOutputType
} from "./message-broker";

require("./telemetry.js"); // Load telemetry before running the rest of the app

import { readFileSync } from "fs";
import {createApp, createAppApiResponseCommandHandler, createAppCommandHandler} from "./app";
import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentEventType,
  PaymentService,
  Quote,
} from "./payment";
import { IlpPeerService, InMemoryIlpPeerRepository } from "./ilp-peer";
import { RatesService } from "./rates";
import { InMemoryRepository } from "./repository";
import { WalletAddress, WalletAddressService } from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPayment,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import logger from "./logger";

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressService = new WalletAddressService(
  new InMemoryRepository<WalletAddress>()
);
const ilpPeerService = new IlpPeerService(new InMemoryIlpPeerRepository());
const ratesService = new RatesService();
const liquidityService = new LiquidityService();
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  new InMemoryRepository<RemoteIncomingPayment>()
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);

const inPaymentRepo = new InMemoryRepository<IncomingPayment>()
const quoteRepo = new InMemoryRepository<Quote>()

const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  inPaymentRepo,
  new InMemoryRepository<OutgoingPayment>(),
  quoteRepo,
  eventProducer
);

async function seed(seedFilePath: string) {
  const data = readFileSync(seedFilePath, "utf8");
  const seed = JSON.parse(data);

  for (const walletAddress of seed.walletAddresses) {
    await walletAddressService.createWalletAddress(walletAddress);
  }

  for (const peer of seed.peers) {
    await ilpPeerService.create(peer);
  }

  ilpConnector.ownDestinationAddress = seed.ilpConfig.address;

  return seed;
}

(async () => {
  await eventConsumer.registerConsumer(
    PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
    paymentService.handleLocalOutgoingPaymentFundedEvent.bind(paymentService)
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.REMOTE_QUOTE_REQUESTED,
    ilpConnector.handleRemoteQuoteRequestedEvent.bind(ilpConnector)
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED,
    ilpConnector.handlePaymentPreparePacketAcceptedEvent.bind(ilpConnector)
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.ILP_QUOTE_PREPARE_PACKET_RECEIVED,
    paymentService.handleIlpQuotePacketReceived.bind(paymentService)
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_RECEIVED,
    paymentService.handleIlpPaymentPreparePacketReceivedEvent.bind(
      paymentService
    )
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.ILP_PAYMENT_FULFILL_PACKET_RECEIVED,
    paymentService.handleIlpPaymentFulfillPacketReceivedEvent.bind(
      paymentService
    )
  );

  await eventConsumer.registerConsumer(
    PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
    ilpConnector.handleRemoteOutgoingPaymentFundedEvent.bind(ilpConnector)
  );

  const seedFilePath = process.env["SEED_FILE_LOCATION"] || "seed.json";
  logger.info(`Running seed from ${seedFilePath}`)

  const seedObj = await seed(seedFilePath)

  // kafka common options
  const kafkaUrl = process.env["KAFKA_URL"] || "kafka:29092"
  const kafkaProducerCommonOptions: RafikiKafkaJsonProducerOptions = {
    kafkaBrokerList: kafkaUrl,
    producerClientId: `rafiki-${crypto.randomUUID()}`,
  }
  const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
    kafkaBrokerList: kafkaUrl,
    kafkaGroupId: `rafiki-commands`
  }

  logger.info(`Init Kafka on '${kafkaUrl}'`)

  const apiReqCache : Map<string, Object | Error> = new Map();

  // Init Producer/Consumer:
  const producer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions)
  await producer.connect()
  const consumerCmdHandler = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions)
  const consumerApiRspHandler = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions)

  logger.info(`Kafka Connected. Initializing Command-Handler...`)
  const startCommandHandler = createAppCommandHandler(
    paymentService,
    consumerCmdHandler,
    producer
  )
  await startCommandHandler()

  logger.info(`Kafka Connected. Initializing API-Response-Handler...`)
  const startApiRspHandler = createAppApiResponseCommandHandler(
    consumerApiRspHandler,
    apiReqCache
  )
  await startApiRspHandler()

  logger.info(`Create App...`)
  const start = createApp(
    Number(seedObj.port ?? 3000),
    30,//api cache timeout in seconds
    //paymentService,
    //quoteRepo,
    //inPaymentRepo,
    remoteIncomingPaymentService,
    ilpConnector,
    producer,
    apiReqCache
  );
  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    producer.disconnect()
    producer.destroy()
    consumerCmdHandler.disconnect()
    consumerCmdHandler.destroy(true)
    consumerApiRspHandler.disconnect()
    consumerApiRspHandler.destroy(true)

    process.exit(0);
  });
})();

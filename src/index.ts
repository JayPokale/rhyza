require("./telemetry.js"); // Load telemetry before running the rest of the app

import { readFileSync } from "fs";
import { createApp } from "./app";
import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import { PaymentEventType, PaymentService } from "./payment";
import { IlpPeerService } from "./ilp-peer";
import { RatesService } from "./rates";
import { WalletAddressService } from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import { RemoteIncomingPaymentService } from "./remote-incoming-payment";
import pool from "./db";
import logger from "./logger";
import {
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  QuotePsqlRepository,
  WalletAddressPsqlRepository,
  RemoteIncomingPaymentPsqlRepository,
  IlpPeerPsqlRepository,
  WalletAddressRepository,
  WalletAddressInMemoryRepository,
  IncomingPaymentInMemoryRepository,
  IncomingPaymentRepository,
  OutgoingPaymentRepository,
  OutgoingPaymentInMemoryRepository,
  QuoteRepository,
  QuoteInMemoryRepository,
  RemoteIncomingPaymentInMemoryRepository,
  RemoteIncomingPaymentRepository,
  IlpPeerInMemoryRepository,
  IlpPeerRepository,
} from "./repository";

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressRepository = new WalletAddressRepository(
  new WalletAddressInMemoryRepository(),
  new WalletAddressPsqlRepository(pool)
);

const walletAddressService = new WalletAddressService(walletAddressRepository);

const ilpPeerRepository = new IlpPeerRepository(
  new IlpPeerInMemoryRepository(),
  new IlpPeerPsqlRepository(pool)
);
const ilpPeerService = new IlpPeerService(ilpPeerRepository);

const ratesService = new RatesService();
const liquidityService = new LiquidityService();

const remoteIncomingPaymentRepository = new RemoteIncomingPaymentRepository(
  new RemoteIncomingPaymentInMemoryRepository(),
  new RemoteIncomingPaymentPsqlRepository(pool)
);
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  remoteIncomingPaymentRepository
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);

const incomingPaymentRepository = new IncomingPaymentRepository(
  new IncomingPaymentInMemoryRepository(),
  new IncomingPaymentPsqlRepository(pool)
);
const outgoingPaymentRepository = new OutgoingPaymentRepository(
  new OutgoingPaymentInMemoryRepository(),
  new OutgoingPaymentPsqlRepository(pool)
);
const quotePaymentRepository = new QuoteRepository(
  new QuoteInMemoryRepository(),
  new QuotePsqlRepository(pool)
);
const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  incomingPaymentRepository,
  outgoingPaymentRepository,
  quotePaymentRepository,
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
  try {
    logger.debug("Attempting to connect to the database...");
    await pool.query("SELECT 1");
    logger.debug("Database connection verified");
  } catch (err) {
    logger.error("Database connection failed:", err);
    throw err;
  }

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
  logger.info(`Running seed from ${seedFilePath}`);

  const seedObj = await seed(seedFilePath);

  const start = createApp(
    Number(seedObj.port ?? 3000),
    paymentService,
    remoteIncomingPaymentService,
    ilpConnector
  );

  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

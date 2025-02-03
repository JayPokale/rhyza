import { readFileSync } from "fs";
import { createApp } from "./app";
import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentEventType,
  PaymentService,
  Quote,
} from "./payment";
import { IlpPeerPsqlRepository, IlpPeerService } from "./ilp-peer";
import { RatesService } from "./rates";
import { InMemoryRepository } from "./repository";
import {
  WalletAddressService,
  WalletAddressPsqlRepository,
} from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPayment,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import pool from "./db";
import logger from "./logger";

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressService = new WalletAddressService(
  new WalletAddressPsqlRepository(pool)
);
const ilpPeerService = new IlpPeerService(new IlpPeerPsqlRepository(pool));
const ratesService = new RatesService();
const liquidityService = new LiquidityService();
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  new InMemoryRepository<RemoteIncomingPayment>()
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);
const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  new InMemoryRepository<IncomingPayment>(),
  new InMemoryRepository<OutgoingPayment>(),
  new InMemoryRepository<Quote>(),
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
  // Ensures database connects before starting the app
  // where connection will be used
  await pool.query("SELECT 1");
  console.log("Database connection verified");

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

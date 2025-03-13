require("./telemetry.js"); // Load telemetry before running the rest of the app

import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentEventType,
  PaymentService,
  Quote,
} from "./payment";
import { IlpPeer, IlpPeerService } from "./ilp-peer";
import { RatesService } from "./rates";
import { WalletAddress, WalletAddressService } from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPayment,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import pool from "./db";
import { readFileSync } from "fs";
import logger from "./logger";
import {
  WalletAddressPsqlRepository,
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  QuotePsqlRepository,
  RemoteIncomingPaymentPsqlRepository,
  IlpPeerPsqlRepository,
  InMemoryCache,
  RedisCache,
} from "./repository";
import Redis from "ioredis";
import { Amount } from "./shared";

const ONE_HOUR_IN_MS = 3_600_000;

const redisUrl = process.env["REDIS_URL"];
if (!redisUrl) {
  throw new Error("Environment variables REDIS_URL is required");
}

const redisClient = new Redis(redisUrl);

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressRepository = new WalletAddressPsqlRepository(
  new RedisCache<WalletAddress>(redisClient, ONE_HOUR_IN_MS),
  pool
);

const walletAddressService = new WalletAddressService(walletAddressRepository);
const ilpPeerRepository = new IlpPeerPsqlRepository(
  new RedisCache<IlpPeer>(redisClient, ONE_HOUR_IN_MS),
  pool
);
const ilpPeerService = new IlpPeerService(ilpPeerRepository);

const ratesService = new RatesService();
const liquidityService = new LiquidityService();

const remoteIncomingPaymentRepository = new RemoteIncomingPaymentPsqlRepository(
  new RedisCache<RemoteIncomingPayment>(redisClient, ONE_HOUR_IN_MS),
  pool
);
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  remoteIncomingPaymentRepository
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);

const incomingPaymentRepository = new IncomingPaymentPsqlRepository(
  new RedisCache<IncomingPayment>(redisClient, ONE_HOUR_IN_MS),
  pool
);
const outgoingPaymentRepository = new OutgoingPaymentPsqlRepository(
  new RedisCache<OutgoingPayment>(
    redisClient,
    ONE_HOUR_IN_MS,
    (value: string): OutgoingPayment => {
      const parsed = JSON.parse(value) as Omit<
        OutgoingPayment,
        "debitAmount" | "sentAmount"
      > & {
        debitAmount: string;
        sentAmount: string;
      };
      return {
        ...parsed,
        debitAmount: BigInt(parsed.debitAmount),
        sentAmount: BigInt(parsed.sentAmount),
      };
    }
  ),
  pool
);
const quotePaymentRepository = new QuotePsqlRepository(
  new RedisCache<Quote>(redisClient, ONE_HOUR_IN_MS, (value: string): Quote => {
    const parsed = JSON.parse(value) as Omit<
      Quote,
      "receiveAmount" | "debitAmount" | "expiresAt"
    > & {
      receiveAmount: Omit<Amount, "value"> & { value: string };
      debitAmount: Omit<Amount, "value"> & { value: string };
      expiresAt: string;
    };
    return {
      ...parsed,
      receiveAmount: {
        ...parsed.receiveAmount,
        value: BigInt(parsed.receiveAmount.value),
      },
      debitAmount: {
        ...parsed.debitAmount,
        value: BigInt(parsed.debitAmount.value),
      },
      expiresAt: new Date(parsed.expiresAt),
    };
  }),
  pool
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
  logger.info(`Running seed from ${seedFilePath}`);

  const data = readFileSync(seedFilePath, "utf8");
  const seed = JSON.parse(data);

  try {
    // boolean primary key ensures only 1 row (can only be true)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS seed_lock (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE,
        completed BOOLEAN DEFAULT FALSE
      )
    `);

    // Try to insert a lock record - only the first instance will succeed
    const lockResult = await pool.query(`
      INSERT INTO seed_lock (id, completed)
      VALUES (TRUE, FALSE)
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `);

    if (lockResult.rows.length === 0) {
      logger.info(
        "Database already seeded or in the process of seeding, skipping"
      );
      return seed;
    }

    // Got the lock, do the seeding
    logger.info("Seeding database...");

    for (const walletAddress of seed.walletAddresses) {
      await walletAddressService.createWalletAddress(walletAddress);
    }

    for (const peer of seed.peers) {
      await ilpPeerService.create(peer);
    }

    ilpConnector.ownDestinationAddress = seed.ilpConfig.address;

    await pool.query("UPDATE seed_lock SET completed = TRUE WHERE id = TRUE");

    logger.info("Database seeding completed");
    return seed;
  } catch (error) {
    logger.error({ error }, "Error during database seeding");
    throw error;
  }
}

async function init() {
  try {
    logger.debug("Attempting to connect to the database...");
    await pool.query("SELECT 1");
    logger.debug("Database connection verified");
  } catch (err) {
    logger.error("Database connection failed:", err);
    throw err;
  }

  await seed(process.env["SEED_FILE_LOCATION"] || "seed.json");

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
}

export {
  init,
  pool,
  paymentService,
  PaymentService,
  ilpConnector,
  IlpConnector,
  remoteIncomingPaymentService,
  RemoteIncomingPaymentService,
};

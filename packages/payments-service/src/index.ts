require("./telemetry.js"); // Load telemetry before running the rest of the app

import { EventEmitterPubSub } from "./event";
import {
  AssetAccountPsqlRepository,
  LiquidityService,
  PeerAccountPsqlRepository,
  TBLedgerAccountRepository,
  TBLedgerTransferRepository,
  WalletAddressAccountPsqlRepository,
} from "./liquidity";
import {
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  PaymentEventType,
  PaymentService,
  QuotePsqlRepository,
} from "./payment";
import {
  IlpPeerEvent,
  IlpPeerPsqlRepository,
  IlpPeerService,
} from "./ilp-peer";
import { RatesService } from "./rates";
import {
  WalletAddressService,
  WalletAddressPsqlRepository,
  WalletAddressEvent,
} from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPaymentPsqlRepository,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import pool from "./db";
import { readFileSync } from "fs";
import logger from "./logger";
import { AssetEvent, AssetPsqlRepository, AssetService } from "./asset";
import { createClient } from "tigerbeetle-node";

const tbClient = createClient({
  cluster_id: 0n,
  replica_addresses: (
    process.env["TB_REPLICA_ADDRESSES"] as unknown as string
  ).split(","),
});

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const assetService = new AssetService(
  new AssetPsqlRepository(pool),
  eventProducer
);
const walletAddressService = new WalletAddressService(
  new WalletAddressPsqlRepository(pool),
  eventProducer
);
const ilpPeerService = new IlpPeerService(
  new IlpPeerPsqlRepository(pool),
  eventProducer
);
const ratesService = new RatesService();
const liquidityService = new LiquidityService(
  new AssetAccountPsqlRepository(pool),
  new PeerAccountPsqlRepository(pool),
  new WalletAddressAccountPsqlRepository(pool),
  new TBLedgerTransferRepository(tbClient),
  new TBLedgerAccountRepository(tbClient)
);

const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  new RemoteIncomingPaymentPsqlRepository(pool)
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);
const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  new IncomingPaymentPsqlRepository(pool),
  new OutgoingPaymentPsqlRepository(pool),
  new QuotePsqlRepository(pool),
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

    for (const asset of seed.assets) {
      await assetService.createAsset(asset);
    }

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

  await eventConsumer.registerConsumer(
    AssetEvent.ASSET_CREATED,
    liquidityService.handleAssetCreatedEvent.bind(liquidityService)
  );

  await eventConsumer.registerConsumer(
    IlpPeerEvent.ILP_PEER_CREATED,
    liquidityService.handleIlpPeerCreatedEvent.bind(liquidityService)
  );

  await eventConsumer.registerConsumer(
    WalletAddressEvent.WALLET_ADDRESS_CREATED,
    liquidityService.handleWalletAddressCreatedEvent.bind(liquidityService)
  );

  await seed(process.env["SEED_FILE_LOCATION"] || "seed.json");
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

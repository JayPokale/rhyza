require("./telemetry.js"); // Load telemetry before running the rest of the app

import { readFileSync } from "fs";
import { createApp } from "./app";
import {
  paymentService,
  ilpConnector,
  ilpPeerService,
  walletAddressService,
  eventConsumer,
  PaymentEventType,
  remoteIncomingPaymentService,
  pool,
} from "payments-service";
import logger from "./logger";

async function seed(seedFilePath: string) {
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

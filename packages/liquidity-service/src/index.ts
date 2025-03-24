import logger from "./logger";
import pool from "./db";
import { readFileSync } from "fs";
import {
  AssetAccountPsqlRepository,
  LiquidityService,
  PeerAccountPsqlRepository,
  TBLedgerAccountRepository,
  TBLedgerTransferRepository,
  WalletAddressAccountPsqlRepository,
} from "./liquidity";
import { createClient } from "tigerbeetle-node";
import { createApp } from "./app";
import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
} from "./message-broker";
import { LiquidityServiceEventHandler } from "./message-broker/event/handler";

const tbClient = createClient({
  cluster_id: 0n,
  replica_addresses: (
    process.env["TB_REPLICA_ADDRESSES"] as unknown as string
  ).split(","),
});

const liquidityService = new LiquidityService(
  new AssetAccountPsqlRepository(pool),
  new PeerAccountPsqlRepository(pool),
  new WalletAddressAccountPsqlRepository(pool),
  new TBLedgerTransferRepository(tbClient),
  new TBLedgerAccountRepository(tbClient)
);

(async () => {
  try {
    logger.debug("Attempting to connect to the database...");
    await pool.query("SELECT 1");
    logger.debug("Database connection verified");
  } catch (err) {
    logger.error("Database connection failed:", err);
    throw err;
  }

  await seed(process.env["SEED_FILE_LOCATION"] || "seed.json");

  //Kafka:
  const kafkaUrl = process.env["KAFKA_URL"] || "kafka:29092";

  const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
    kafkaBrokerList: kafkaUrl,
    // Ensure we are sending to a single instance via [murmur2_random]:
    kafkaGroupId: `rafiki-commands`,
  };
  logger.info(`Init Kafka on '${kafkaUrl}'`);

  const consumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions);

  const liquidityEventHandler = new LiquidityServiceEventHandler(
    consumer,
    liquidityService
  );

  await liquidityEventHandler.start();

  const startApp = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    liquidityService
  );

  await startApp();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

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
      await liquidityService.createAssetAccount({
        id: crypto.randomUUID(),
        code: asset.code,
        scale: asset.scale,
      });
    }

    for (const walletAddress of seed.walletAddresses) {
      await liquidityService.createWalletAddressAccount({
        id: crypto.randomUUID(),
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
      });
    }

    for (const peer of seed.peers) {
      await liquidityService.createIlpPeerAccount({
        id: crypto.randomUUID(),
        assetCode: peer.assetCode,
        assetScale: peer.assetScale,
      });
    }

    await pool.query("UPDATE seed_lock SET completed = TRUE WHERE id = TRUE");

    logger.info("Database seeding completed");
    return seed;
  } catch (error) {
    logger.error({ error }, "Error during database seeding");
    throw error;
  }
}

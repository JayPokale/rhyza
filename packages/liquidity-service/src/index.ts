import logger from "./logger";
import pool from "./db";
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

  const start = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    liquidityService
  );

  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

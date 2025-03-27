import { Pool } from "pg";
import logger from "./logger";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ||
    "postgres://postgres:password@localhost:5432/database",
  max: 150, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // how long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // how long to wait for a connection
  maxUses: 7500, // number of times a connection can be used before being destroyed
});

pool.on("connect", () => {
  logger.debug("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  logger.error("Unexpected database error", err);
  process.exit(1);
});

export default pool;

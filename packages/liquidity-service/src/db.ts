import { Pool } from "pg";
import logger from "./logger";

const pool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ||
    "postgres://postgres:password@localhost:5432/database",
});

pool.on("connect", () => {
  logger.debug("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  logger.error("Unexpected database error", err);
  process.exit(1);
});

export default pool;

import { Pool } from "pg";
import {logger} from "./logger";


export const PostgresPool = new Pool({
  connectionString:
    process.env["DATABASE_URL"] ||
    "postgres://postgres:password@localhost:5432/database",
});

PostgresPool.on("connect", () => {
  logger.debug("Connected to PostgreSQL");
});

PostgresPool.on("error", (err:Error) => {
  logger.error("Unexpected database error", err);
  process.exit(1);
});

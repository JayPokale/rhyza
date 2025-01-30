import { Pool } from "pg";

/*
  TODO: Handle DB initialization via Docker Compose

  To run PostgreSQL in Docker:

  UP (from project root):
  docker run --name pg_container \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB=database \
    -p 5432:5432 \
    -v $(pwd)/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql \
    -d postgres

  DOWN:
  docker rm -v $(docker stop pg_container)

  CONNECT FROM HOST:
  docker exec -it pg_container psql -U postgres -d database
*/

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:password@localhost:5432/database",
});

pool.on("connect", () => {
  console.log("Connected to PostgreSQL");
});

pool.on("error", (err) => {
  console.error("Unexpected database error", err);
  process.exit(1);
});

export default pool;

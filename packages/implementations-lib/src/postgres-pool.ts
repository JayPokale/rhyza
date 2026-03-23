import { Pool } from 'pg';
import { PinoLogger } from './logger';

const logger = new PinoLogger()

export const postgresPool = new Pool({
  connectionString:
    process.env['DATABASE_URL'] ||
    'postgres://postgres:password@localhost:5432/database'
});

postgresPool.on('connect', () => {
  logger.debug('Connected to PostgreSQL');
});

postgresPool.on('error', (err: Error) => {
  logger.error('Unexpected database error', err);
  process.exit(1);
});

import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { ICache } from 'common-types-lib';

export class RedisCache<T> implements ICache<T> {
  constructor(
    private redisClient: Redis,
    private keyTtlMs: number,
    private logger: Logger,
    private parseFn?: (value: string) => T
  ) {}

  async get(id: string): Promise<T | undefined> {
    const value = await this.redisClient.get(id);
    if (!value) return;

    try {
      if (this.parseFn) {
        return this.parseFn(value);
      } else {
        return JSON.parse(value) as T;
      }
    } catch (err) {
      this.logger.error('Error parsing cached value:', err);
      return;
    }
  }

  async getKeyExpiry(key: string): Promise<number | undefined> {
    const expiryTimestamp = await this.redisClient.pexpiretime(key);

    if (!expiryTimestamp || expiryTimestamp <= 0) return undefined;

    return expiryTimestamp;
  }

  async set(key: string, value: T): Promise<boolean> {
    const stringifiedValue = JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') {
        return val.toString();
      }
      return val;
    });

    return (
      (await this.redisClient.set(
        key,
        stringifiedValue,
        'PX',
        this.keyTtlMs
      )) === 'OK'
    );
  }

  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}

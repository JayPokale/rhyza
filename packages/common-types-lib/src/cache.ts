export interface ICache<T> {
  get(key: string): Promise<T | undefined>;
  getKeyExpiry(key: string): Promise<number | undefined>;
  set(key: string, value: T): Promise<boolean>;
  setWithTtl(key: string, value: T, ttlMs: number): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface ICached<T> {
  expiry: number;
  data: T;
}

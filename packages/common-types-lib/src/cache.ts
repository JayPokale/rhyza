export interface Cache<T> {
  get(key: string): Promise<T | undefined>;
  getKeyExpiry(key: string): Promise<number | undefined>;
  set(key: string, value: T): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export interface Cached<T> {
  expiry: number;
  data: T;
}

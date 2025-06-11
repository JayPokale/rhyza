/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {ICache, ICached} from "common-types-lib";

export class InMemoryCache<T> implements ICache<T> {
    private map: Map<string, ICached<T>>;
    private keyTtlMs: number;

    constructor(keyTtlMs: number) {
        this.map = new Map<string, ICached<T>>();
        this.keyTtlMs = keyTtlMs;
    }

    private getAndCheckExpiry(key: string): ICached<T> | undefined {
        const cached = this.map.get(key);
        if (cached?.expiry && Date.now() >= cached.expiry) {
            this.deleteKey(key);
            return undefined;
        }

        return cached;
    }

    private deleteKey(key: string): void {
        this.map.delete(key);
    }

    async get(key: string): Promise<T | undefined> {
        const cached = this.getAndCheckExpiry(key);
        return cached?.data;
    }

    async getKeyExpiry(key: string): Promise<number | undefined> {
        const cached = this.getAndCheckExpiry(key);
        return cached ? cached.expiry : undefined;
    }

    async delete(key: string): Promise<void> {
        this.deleteKey(key);
    }

    async set(key: string, value: T): Promise<boolean> {
        this.map.set(key, {expiry: Date.now() + this.keyTtlMs, data: value});
        return true;
    }
}

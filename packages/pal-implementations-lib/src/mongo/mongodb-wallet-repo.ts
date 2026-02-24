/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import {Collection, CollectionInfo, Db, MongoClient} from 'mongodb';
import { IPalWalletAddress, IPalWalletAddressRepository } from 'pal-domain-lib';
import * as console from 'node:console';

const DB_NAME = 'pal';
const COLLECTION_NAME: string = 'wallets';
const TIMEOUT_MS: number = 5_000;

export class MongoDbWalletRepoRepo implements IPalWalletAddressRepository {
  private readonly _connectionString: string;
  private _client!: MongoClient;
  private _collection!: Collection<IPalWalletAddress>;

  constructor(connectionString: string) {
    this._connectionString = connectionString;
  }

  private _checkInitialisedOrThrow(): boolean {
    if (!this._client || !this._collection) {
      throw new Error('MongoClient not initialised');
    }
    return true;
  }

  async init(): Promise<void> {
    console.info(`Initializing ${this.constructor.name}...`);
    try {
      this._client = new MongoClient(this._connectionString, {
        timeoutMS: TIMEOUT_MS
      });
      await this._client.connect();
      const db: Db = this._client.db(DB_NAME);

      // Check if the collection already exists.
      const collections: (Pick<CollectionInfo, "name" | "type"> | CollectionInfo)[] = await db.listCollections().toArray();
      const collectionExists: boolean = collections.some((collection) => {
        return collection.name === COLLECTION_NAME;
      });

      // load or create the collection (and add its indexes) - should check version and perform migrations
      if (collectionExists) {
        this._collection = db.collection<IPalWalletAddress>(COLLECTION_NAME);
      } else {
        this._collection =
          await db.createCollection<IPalWalletAddress>(COLLECTION_NAME);
        await this._collection.createIndex({ address: 1 }, { unique: true });
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        throw e;
      }
      const error = new Error(
        "Unable to connect to the database: 'unknown error'"
      );
      console.error(error);
      throw error;
    }

    console.info(`${this.constructor.name} initialized`);
  }

  async destroy(): Promise<void> {
    this._checkInitialisedOrThrow();

    await this._client.close();
  }

  async store(asset: IPalWalletAddress): Promise<void> {
    this._checkInitialisedOrThrow();

    await this._collection.insertOne(asset).catch((e: unknown) => {
      console.error(e);
      throw new Error(
        `Unable to store wallet address - error: ${(e as Error).message}`
      );
    });

    return Promise.resolve();
  }

  async fetch(address: string): Promise<IPalWalletAddress | null> {
    this._checkInitialisedOrThrow();

    const doc = await this._collection
      .findOne({ address: address })
      .catch((e: unknown) => {
        console.error(e);
        throw new Error(
          `Unable to get wallet by address - error: ${(e as Error).message}`
        );
      });

    if (!doc) {
      return null;
    }

    return {
      address: doc.address,
      publicName: doc.publicName,
      isActive: doc.isActive,
      assetCode: doc.assetCode,
      assetScale: doc.assetScale
    };
  }

  /*
  async fetchByPublicName(publicName: string): Promise<IPalWalletAddress | null> {
    this._checkInitialisedOrThrow();

    const doc = await this._collection.findOne({publicName: publicName}).catch((e: unknown) => {
      console.error(e);
      throw new Error((`Unable to get wallet by publicName - error: ${(e as Error).message}`));
    });

    if (!doc) {
      return null;
    }

    return {
      address: doc.address,
      publicName: doc.publicName,
      isActive: doc.isActive,
      assetCode: doc.assetCode,
      assetScale: doc.assetScale
    };
  }
  */
}

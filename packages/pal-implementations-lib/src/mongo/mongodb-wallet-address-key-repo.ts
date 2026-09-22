import {
  Collection,
  CollectionInfo,
  Db,
  MongoClient,
  MongoServerError
} from 'mongodb';
import { ILogger } from 'common-types-lib';
import { IPalWalletAddressKeyDto } from 'pal-public-types-lib';
import {
  DuplicateWalletAddressKeyError,
  IPalWalletAddressKeyRepository
} from 'pal-domain-lib';

const DB_NAME = 'pal';
const COLLECTION_NAME = 'walletAddressKeys';
const TIMEOUT_MS = 5_000;

export class MongoDbWalletAddressKeyRepo
  implements IPalWalletAddressKeyRepository
{
  private _logger: ILogger;
  private readonly _connectionString: string;
  private _client!: MongoClient;
  private _collection!: Collection<IPalWalletAddressKeyDto>;

  constructor(connectionString: string, logger: ILogger) {
    this._connectionString = connectionString;
    this._logger = logger;
  }

  private _checkInitialisedOrThrow(): boolean {
    if (!this._client || !this._collection) {
      throw new Error('MongoClient not initialised');
    }
    return true;
  }

  async init(): Promise<void> {
    this._logger.info(`Initializing ${this.constructor.name}...`);
    try {
      this._client = new MongoClient(this._connectionString, {
        timeoutMS: TIMEOUT_MS
      });
      await this._client.connect();
      const db: Db = this._client.db(DB_NAME);

      const collections: (
        | Pick<CollectionInfo, 'name' | 'type'>
        | CollectionInfo
      )[] = await db.listCollections().toArray();
      const collectionExists = collections.some((collection) => {
        return collection.name === COLLECTION_NAME;
      });

      if (collectionExists) {
        this._collection =
          db.collection<IPalWalletAddressKeyDto>(COLLECTION_NAME);
      } else {
        this._collection =
          await db.createCollection<IPalWalletAddressKeyDto>(COLLECTION_NAME);
        await this._collection.createIndex({ id: 1 }, { unique: true });
        await this._collection.createIndex(
          { walletAddressId: 1, 'jwk.kid': 1 },
          { unique: true }
        );
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        this._logger.error(e);
        throw e;
      }
      const error = new Error(
        "Unable to connect to the database: 'unknown error'"
      );
      this._logger.error(error);
      throw error;
    }

    this._logger.info(`${this.constructor.name} initialized`);
  }

  async destroy(): Promise<void> {
    this._checkInitialisedOrThrow();
    await this._client.close();
  }

  async store(key: IPalWalletAddressKeyDto): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      await this._collection.updateOne(
        { id: key.id },
        { $set: key },
        { upsert: true }
      );
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000) {
        throw new DuplicateWalletAddressKeyError(
          `Wallet address key with kid ${key.jwk.kid} already exists`
        );
      }
      this._logger.error(e);
      throw new Error(
        `Unable to store wallet address key - error: ${(e as Error).message}`
      );
    }
  }

  async fetchByWalletAddressId(
    walletAddressId: string
  ): Promise<IPalWalletAddressKeyDto[]> {
    this._checkInitialisedOrThrow();

    try {
      const docs = await this._collection.find({ walletAddressId }).toArray();

      return docs.map((doc) => {
        return {
          id: doc.id,
          walletAddressId: doc.walletAddressId,
          jwk: {
            kid: doc.jwk.kid,
            alg: doc.jwk.alg,
            kty: doc.jwk.kty,
            crv: doc.jwk.crv,
            x: doc.jwk.x,
            ...(doc.jwk.use ? { use: doc.jwk.use } : {})
          }
        };
      });
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to get wallet address keys - error: ${(e as Error).message}`
      );
    }
  }
}

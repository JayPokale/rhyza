import { Collection, CollectionInfo, Db, MongoClient } from 'mongodb';
import { IGrant, IGrantRepository } from 'auth-domain-lib';
import { ILogger } from 'common-types-lib';

const DB_NAME = 'auth';
const GRANTS_COLLECTION_NAME = 'grants';
const TIMEOUT_MS = 5_000;

export class MongoDbGrantRepo implements IGrantRepository {
  private readonly _connectionString: string;
  private readonly _logger: ILogger;
  private _client!: MongoClient;
  private _grantCollection!: Collection<IGrant>;

  constructor(connectionString: string, logger: ILogger) {
    this._connectionString = connectionString;
    this._logger = logger;
  }

  private _checkInitialisedOrThrow(): boolean {
    if (!this._client || !this._grantCollection) {
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

      // Check if the collection already exists.
      const collections: (
        | Pick<CollectionInfo, 'name' | 'type'>
        | CollectionInfo
      )[] = await db.listCollections().toArray();

      const grantsCollectionExists = collections.some(
        (collection) => collection.name === GRANTS_COLLECTION_NAME
      );

      // Load or create the collection (and add its indexes) - should check version and perform migrations
      if (grantsCollectionExists) {
        this._grantCollection = db.collection<IGrant>(GRANTS_COLLECTION_NAME);
      } else {
        this._grantCollection = await db.createCollection<IGrant>(
          GRANTS_COLLECTION_NAME
        );
        await this._grantCollection.createIndex({ id: 1 }, { unique: true });
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

  async storeMany(grants: IGrant[]): Promise<void> {
    this._checkInitialisedOrThrow();
    throw new Error('Method not implemented.');
  }

  async fetchById(id: string): Promise<IGrant | undefined> {
    this._checkInitialisedOrThrow();
    throw new Error('Method not implemented.');
  }

  async fetchByIds(ids: string[]): Promise<IGrant[]> {
    this._checkInitialisedOrThrow();

    if (ids.length === 0) return [];

    try {
      const docs = await this._grantCollection
        .find({ id: { $in: ids } })
        .toArray();

      return docs.map((doc) => ({
        id: doc.id,
        startMethods: doc.startMethods,
        continueToken: doc.continueToken,
        continueId: doc.continueId,
        state: doc.state,
        finalizationReason: doc.finalizationReason,
        client: doc.client,
        subjectIds: doc.subjectIds,
        accesses: doc.accesses,
        finishMethod: doc.finishMethod,
        finishUri: doc.finishUri,
        interaction: doc.interaction,
        lastContinuedAt: doc.lastContinuedAt,
        accessTokens: doc.accessTokens
      }));
    } catch (err) {
      this._logger.error(err);
      throw new Error(
        `Unable to fetch grants - error: ${(err as Error).message}`
      );
    }
  }
}

import { Collection, CollectionInfo, Db, MongoClient } from 'mongodb';
import {
  IIncomingPayment,
  IIncomingPaymentRepository
} from 'payments-domain-lib';

const DB_NAME = 'payments';
const COLLECTION_NAME = 'incomingPayments';
const TIMEOUT_MS = 5_000;

export class MongoDbIncomingPaymentRepo implements IIncomingPaymentRepository {
  private readonly _connectionString: string;
  private _client!: MongoClient;
  private _collection!: Collection<IIncomingPayment>;

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
      const collections: (
        | Pick<CollectionInfo, 'name' | 'type'>
        | CollectionInfo
      )[] = await db.listCollections().toArray();
      const collectionExists = collections.some(
        (collection) => collection.name === COLLECTION_NAME
      );

      // load or create the collection (and add its indexes) - should check version and perform migrations
      if (collectionExists) {
        this._collection = db.collection<IIncomingPayment>(COLLECTION_NAME);
      } else {
        this._collection =
          await db.createCollection<IIncomingPayment>(COLLECTION_NAME);
        await this._collection.createIndex({ id: 1 }, { unique: true });
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

  async storeMany(payments: IIncomingPayment[]): Promise<void> {
    this._checkInitialisedOrThrow();

    if (payments.length === 0) return;

    try {
      await this._collection.insertMany(payments);
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to store incoming payments - error: ${(e as Error).message}`
      );
    }
  }

  async fetchByIds(ids: string[]): Promise<IIncomingPayment[]> {
    this._checkInitialisedOrThrow();

    if (ids.length === 0) return [];

    try {
      const docs = await this._collection.find({ id: { $in: ids } }).toArray();

      return docs.map((doc) => ({
        id: doc.id,
        walletAddressId: doc.walletAddressId,
        state: doc.state,
        assetCode: doc.assetCode,
        assetScale: doc.assetScale,
        expiresAt: doc.expiresAt,
        incomingAmount: doc.incomingAmount,
        receivedAmount: doc.receivedAmount
      }));
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to fetch incoming payments - error: ${(e as Error).message}`
      );
    }
  }
}

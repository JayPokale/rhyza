import {BulkWriteResult, Collection, CollectionInfo, Db, InsertManyResult, MongoClient} from 'mongodb';
import {
  ILedger,
  ILedgerDTO,
  LedgerDtoSerializer,
  ILedgerAccount,
  ILedgerAccountDTO,
  LedgerAccountDtoSerializer,
  ILedgerTransaction,
  ILedgerTransactionDTO,
  LedgerTransactionDtoSerializer
} from 'pal-domain-lib';
import * as console from 'node:console';
import {ILedgerReadSideRepository} from "./readside-interfaces";

const DB_NAME = 'pal';
const TIMEOUT_MS: number = 5_000;
const LEDGERS_COLLECTION_NAME: string = 'ledgers';
const LEDGER_ACCOUNTS_COLLECTION_NAME: string = 'ledgerAccounts';
const LEDGER_TRANSACTIONS_COLLECTION_NAME: string = 'ledgerTransactions';


export class MongoDbLedgerReadSideRepo implements ILedgerReadSideRepository {
  private readonly _connectionString: string;
  private _client!: MongoClient;
  private _ledgersCol!: Collection<ILedgerDTO>;
  private _accountsCol!: Collection<ILedgerAccountDTO>;
  private _transactionsCol!: Collection<ILedgerTransactionDTO>;

  constructor(connectionString: string) {
    this._connectionString = connectionString;
  }

  private _checkInitialisedOrThrow(): boolean {
    if (!this._client || !this._ledgersCol || !this._accountsCol || !this._transactionsCol) {
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
      const collections: (Pick<CollectionInfo, 'name' | 'type'>)[] = await db.listCollections().toArray();

      if (collections.some(col => col.name === LEDGERS_COLLECTION_NAME)) {
        this._ledgersCol = db.collection<ILedgerDTO>(LEDGERS_COLLECTION_NAME);
      } else {
        this._ledgersCol = await db.createCollection<ILedgerDTO>(LEDGERS_COLLECTION_NAME);
        await this._ledgersCol.createIndex({ id: 1 }, { unique: true });
      }

      if (collections.some(col => col.name === LEDGER_ACCOUNTS_COLLECTION_NAME)) {
        this._accountsCol = db.collection<ILedgerAccountDTO>(LEDGER_ACCOUNTS_COLLECTION_NAME);
      } else {
        this._accountsCol = await db.createCollection<ILedgerAccountDTO>(LEDGER_ACCOUNTS_COLLECTION_NAME);
        await this._accountsCol.createIndex({ id: 1 }, { unique: true });
      }

      if (collections.some(col => col.name === LEDGER_TRANSACTIONS_COLLECTION_NAME)) {
        this._transactionsCol = db.collection<ILedgerTransactionDTO>(LEDGER_TRANSACTIONS_COLLECTION_NAME);
      } else {
        this._transactionsCol = await db.createCollection<ILedgerTransactionDTO>(LEDGER_TRANSACTIONS_COLLECTION_NAME);
        await this._transactionsCol.createIndex({ id: 1 }, { unique: true });
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


  /*
  * Ledger Methods
  * */
  async storeLedgers(ledgers: ILedger[]): Promise<void> {
    this._checkInitialisedOrThrow();

    let result: BulkWriteResult;
    try {
      const operations = ledgers.map(l => ({
        updateOne: {
          filter: {id: l.id},
          update: {$set: LedgerDtoSerializer.toDTO(l)},
          upsert: true
        }
      }));
      result = await this._ledgersCol.bulkWrite(operations);
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to update ledger - error: ${(e as Error).message}`
      );
    }

    if (result.matchedCount !== ledgers.length) {
      throw new Error(`Failed to upsert ${ledgers.length} ledgers - only ${result.upsertedCount} upserted out of ${ledgers.length} requested`);
    }

    return;
  }

  async fetchLedgers(ids: string[]): Promise<ILedger[]> {
    this._checkInitialisedOrThrow();

    try {
      const docs = await this._ledgersCol.find({id: {$in: ids}}).toArray();

      if (!docs || docs.length === 0) {
        return [];
      }

      return docs.map((doc) => LedgerDtoSerializer.fromDTO(doc));
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to get ledgers - error: ${(e as Error).message}`
      );
    }
  }

  /*
  * Ledger accounts Methods
  * */
  async storeLedgerAccounts(accounts: ILedgerAccount[]): Promise<void> {
    this._checkInitialisedOrThrow();

    let result: BulkWriteResult;
    try {
      // Map your data to the bulkWrite structure
      const operations = accounts.map(a => ({
        updateOne: {
          filter: {id: a.id}, // Unique identifier
          update: {$set: LedgerAccountDtoSerializer.toDTO(a)},
          upsert: true
        }
      }));
      result = await this._accountsCol.bulkWrite(operations, {ordered: false});
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to update ledger - error: ${(e as Error).message}`
      );
    }

    if (result.matchedCount !== accounts.length) {
      throw new Error(`Failed to upsert ${accounts.length} ledger accounts - only ${result.matchedCount} matched out of ${accounts.length} requested`);
    }

    return;
  }

  async fetchLedgerAccounts(ids: string[]): Promise<ILedgerAccount[]> {
    this._checkInitialisedOrThrow();

    try {
      const docs = await this._accountsCol.find({id: {$in: ids}}).toArray();

      if (!docs || docs.length === 0) {
        return [];
      }

      return docs.map((doc) => LedgerAccountDtoSerializer.fromDTO(doc));
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to get ledger accounts - error: ${(e as Error).message}`
      );
    }
  }

  /*
  * Ledger transaction Methods
  * */
  async storeLedgerTransactions(transactions: ILedgerTransaction[]): Promise<void> {
    this._checkInitialisedOrThrow();

    // transactions cannot be modified, so we can just insert them all

    let result: InsertManyResult;
    try {
      const dtos = transactions.map(t => LedgerTransactionDtoSerializer.toDTO(t));
      result = await this._transactionsCol.insertMany(dtos);
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to update ledger - error: ${(e as Error).message}`
      );
    }

    if (result.insertedCount !== transactions.length) {
      throw new Error(`Failed to upsert ${transactions.length} ledger transactions - only ${result.insertedCount} inserted out of ${transactions.length} requested`);
    }

    return;
  }

  async fetchLedgerTransactions(ids: string[]): Promise<ILedgerTransaction[]> {
    this._checkInitialisedOrThrow();

    try {
      const docs = await this._transactionsCol.find({id: {$in: ids}}).toArray();

      if (!docs || docs.length === 0) {
        return [];
      }

      return docs.map((doc) => LedgerTransactionDtoSerializer.fromDTO(doc));
    } catch (e) {
      console.error(e);
      throw new Error(
        `Unable to get ledger transactions - error: ${(e as Error).message}`
      );
    }
  }
}

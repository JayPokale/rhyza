import { Collection, CollectionInfo, Db, MongoClient } from 'mongodb';
import { ILogger } from 'common-types-lib';
import { IPacketCorrelation, IPeer, IPeerRepository } from 'ilp-domain-lib';
import type { IInboundPacketReplyHandle } from 'ilp-domain-lib';

const DB_NAME = 'ilp';
const PEERS_COLLECTION_NAME = 'peers';
const PACKETS_COLLECTION_NAME = 'packetCorrelations';
const INBOUND_REPLY_HANDLES_COLLECTION_NAME = 'inboundPacketReplyHandles';
const TIMEOUT_MS = 5_000;

// Single-writer store for ILP peer configuration and packet correlations.
// Only ilp-command-handler-service should mutate this repo
// API service processes publish CreatePeerCmd/UpdatePeerCmd instead of writing directly,
// so this remains the sole cache/consistency owner regardless of how many
// API service instances are deployed.
export class MongoDbPeerRepository implements IPeerRepository {
  private readonly _connectionString: string;
  private readonly _logger: ILogger;
  private _client!: MongoClient;
  private _peerCollection!: Collection<IPeer>;
  private _packetCollection!: Collection<IPacketCorrelation>;
  private _inboundReplyHandleCollection!: Collection<IInboundPacketReplyHandle>;

  constructor(connectionString: string, logger: ILogger) {
    this._connectionString = connectionString;
    this._logger = logger;
  }

  private _checkInitialisedOrThrow(): boolean {
    if (
      !this._client ||
      !this._peerCollection ||
      !this._packetCollection ||
      !this._inboundReplyHandleCollection
    ) {
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

      const peersCollectionExists = collections.some(
        (collection) => collection.name === PEERS_COLLECTION_NAME
      );
      if (peersCollectionExists) {
        this._peerCollection = db.collection<IPeer>(PEERS_COLLECTION_NAME);
      } else {
        this._peerCollection = await db.createCollection<IPeer>(
          PEERS_COLLECTION_NAME
        );
        await this._peerCollection.createIndex({ peerId: 1 }, { unique: true });
      }

      const packetsCollectionExists = collections.some(
        (collection) => collection.name === PACKETS_COLLECTION_NAME
      );
      if (packetsCollectionExists) {
        this._packetCollection = db.collection<IPacketCorrelation>(
          PACKETS_COLLECTION_NAME
        );
      } else {
        this._packetCollection = await db.createCollection<IPacketCorrelation>(
          PACKETS_COLLECTION_NAME
        );
        await this._packetCollection.createIndex(
          { packetId: 1 },
          { unique: true }
        );
      }

      const inboundReplyHandlesCollectionExists = collections.some(
        (collection) =>
          collection.name === INBOUND_REPLY_HANDLES_COLLECTION_NAME
      );
      if (inboundReplyHandlesCollectionExists) {
        this._inboundReplyHandleCollection =
          db.collection<IInboundPacketReplyHandle>(
            INBOUND_REPLY_HANDLES_COLLECTION_NAME
          );
      } else {
        this._inboundReplyHandleCollection =
          await db.createCollection<IInboundPacketReplyHandle>(
            INBOUND_REPLY_HANDLES_COLLECTION_NAME
          );
        await this._inboundReplyHandleCollection.createIndex(
          { packetId: 1 },
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

  async fetchById(peerId: string): Promise<IPeer | undefined> {
    this._checkInitialisedOrThrow();

    try {
      const doc = await this._peerCollection.findOne({ peerId });
      return doc ? this._peerDocToPeer(doc) : undefined;
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to fetch peer ${peerId} - error: ${(e as Error).message}`
      );
    }
  }

  async fetchAll(): Promise<IPeer[]> {
    this._checkInitialisedOrThrow();

    try {
      const docs = await this._peerCollection.find({}).toArray();
      return docs.map((doc) => this._peerDocToPeer(doc));
    } catch (e) {
      this._logger.error(e);
      throw new Error(`Unable to fetch peers - error: ${(e as Error).message}`);
    }
  }

  async store(peer: IPeer): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      await this._peerCollection.insertOne({ ...peer });
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to store peer ${peer.peerId} - error: ${(e as Error).message}`
      );
    }
  }

  async update(peer: IPeer): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      const { peerId, ...rest } = peer;
      await this._peerCollection.updateOne(
        { peerId },
        { $set: rest },
        { upsert: true }
      );
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to update peer ${peer.peerId} - error: ${(e as Error).message}`
      );
    }
  }

  async fetchPacketById(
    packetId: string
  ): Promise<IPacketCorrelation | undefined> {
    this._checkInitialisedOrThrow();

    try {
      const doc = await this._packetCollection.findOne({ packetId });
      return doc ?? undefined;
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to fetch packet ${packetId} - error: ${(e as Error).message}`
      );
    }
  }

  async storePacket(packet: IPacketCorrelation): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      await this._packetCollection.insertOne({ ...packet });
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to store packet ${packet.packetId} - error: ${(e as Error).message}`
      );
    }
  }

  async updatePacket(packet: IPacketCorrelation): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      const { packetId, ...rest } = packet;
      await this._packetCollection.updateOne(
        { packetId },
        { $set: rest },
        { upsert: true }
      );
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to update packet ${packet.packetId} - error: ${(e as Error).message}`
      );
    }
  }

  async fetchInboundReplyHandle(
    packetId: string
  ): Promise<IInboundPacketReplyHandle | undefined> {
    this._checkInitialisedOrThrow();

    try {
      const doc = await this._inboundReplyHandleCollection.findOne({
        packetId
      });
      return doc ?? undefined;
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to fetch inbound reply handle for packet ${packetId} - error: ${(e as Error).message}`
      );
    }
  }

  async storeInboundReplyHandle(
    handle: IInboundPacketReplyHandle
  ): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      await this._inboundReplyHandleCollection.insertOne({ ...handle });
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to store inbound reply handle for packet ${handle.packetId} - error: ${(e as Error).message}`
      );
    }
  }

  async deleteInboundReplyHandle(packetId: string): Promise<void> {
    this._checkInitialisedOrThrow();

    try {
      await this._inboundReplyHandleCollection.deleteOne({ packetId });
    } catch (e) {
      this._logger.error(e);
      throw new Error(
        `Unable to delete inbound reply handle for packet ${packetId} - error: ${(e as Error).message}`
      );
    }
  }

  private _peerDocToPeer(doc: IPeer & { _id?: unknown }): IPeer {
    return {
      peerId: doc.peerId,
      http: doc.http,
      isActive: doc.isActive,
      packetCorrelations: doc.packetCorrelations
    };
  }
}

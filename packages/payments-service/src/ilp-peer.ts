import { Pool } from "pg";
import { Asset } from "./shared";

export interface IlpPeer {
  id: string;
  asset: Asset;
  address: string;
  connectorUrl: string;
  callbackUrl: string;
}

export interface CreateIlpPeerArgs {
  asset: Asset;
  address: string;
  connectorUrl: string;
  callbackUrl: string;
}

export interface IIlpPeerRepository {
  store(walletAddress: IlpPeer): Promise<void>;
  fetchById(id: string): Promise<IlpPeer | undefined>;
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>;
}

export interface IlpPeerServiceAdapter {
  getById(id: string): Promise<IlpPeer | undefined>;
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>;
  create(args: CreateIlpPeerArgs): Promise<string>;
}

export class IlpPeerService implements IlpPeerServiceAdapter {
  constructor(private peerRepository: IIlpPeerRepository) {}

  public async getById(id: string): Promise<IlpPeer | undefined> {
    return this.peerRepository.fetchById(id);
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return this.peerRepository.getByDestinationAddress(address);
  }

  public async create(args: CreateIlpPeerArgs): Promise<string> {
    const newPeer: IlpPeer = {
      ...args,
      id: crypto.randomUUID(),
    };

    await this.peerRepository.store(newPeer);

    return newPeer.id;
  }
}

interface IlpPeerRecord {
  id: string;
  asset_code: string;
  asset_scale: number;
  address: string;
  connector_url: string;
  callback_url: string;
}

export class IlpPeerPsqlRepository implements PeerRepository {
  TABLE_NAME = "ilp_peers";
  constructor(private pool: Pool) {}

  public async store(ilpPeer: IlpPeer): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, asset_code, asset_scale, address, connector_url, callback_url)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      const values = [
        ilpPeer.id,
        ilpPeer.asset.code,
        ilpPeer.asset.scale,
        ilpPeer.address,
        ilpPeer.connectorUrl,
        ilpPeer.callbackUrl,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing ILP Peer:", error);
      throw error;
    }
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    const res = await this.pool.query<IlpPeerRecord>(
      `SELECT id, asset_code, asset_scale, address, connector_url, callback_url FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      address: row.address,
      connectorUrl: row.connector_url,
      callbackUrl: row.callback_url,
    };
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    const res = await this.pool.query<IlpPeerRecord>(
      `SELECT id, asset_code, asset_scale, address, connector_url, callback_url FROM ${this.TABLE_NAME} WHERE address = $1`,
      [address]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];
    return {
      id: row.id,
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      address: row.address,
      connectorUrl: row.connector_url,
      callbackUrl: row.callback_url,
    };
  }
}

export interface PeerRepository {
  store(walletAddress: IlpPeer): Promise<void>;
  fetchById(id: string): Promise<IlpPeer | undefined>;
  getByDestinationAddress(address: string): Promise<IlpPeer | undefined>;
}

export class IlpPeerInMemoryRepository implements PeerRepository {
  map: Map<string, IlpPeer> = new Map();

  public async store(entity: IlpPeer): Promise<void> {
    this.map.set(entity.id, entity);
  }

  public async fetchById(id: string): Promise<IlpPeer | undefined> {
    return this.map.get(id);
  }

  public async getByDestinationAddress(
    address: string
  ): Promise<IlpPeer | undefined> {
    return [...this.map.values()].find((peer) => peer.address === address);
  }
}

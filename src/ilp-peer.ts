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

export interface PeerRepository {
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
  constructor(private peerRepository: PeerRepository) {}

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

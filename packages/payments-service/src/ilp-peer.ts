import { Asset } from "./shared";
import { EventProducerAdapter, Event } from "./event";

export enum IlpPeerEvent {
  ILP_PEER_CREATED = "ILP_PEER_CREATED",
}

export interface IlpPeerCreatedEvent extends Event {
  type: IlpPeerEvent.ILP_PEER_CREATED;
  data: {
    peer: {
      id: string;
      assetCode: string;
      assetScale: number;
    };
  };
}

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
  constructor(
    private peerRepository: IIlpPeerRepository,
    private eventProducer: EventProducerAdapter
  ) {}

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

    const peerCreatedEvent: IlpPeerCreatedEvent = {
      type: IlpPeerEvent.ILP_PEER_CREATED,
      data: {
        peer: {
          id: newPeer.id,
          assetScale: newPeer.asset.scale,
          assetCode: newPeer.asset.code,
        },
      },
    };

    await this.eventProducer.publish([peerCreatedEvent]);

    return newPeer.id;
  }
}

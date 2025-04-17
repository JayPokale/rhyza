import { Asset } from "./shared";
import { LiquidityServiceAdapter } from "./liquidity";

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
    private liquidityService: LiquidityServiceAdapter
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

    await this.liquidityService.createIlpPeerAccount({
      id: newPeer.id,
      assetScale: newPeer.asset.scale,
      assetCode: newPeer.asset.code,
    });

    return newPeer.id;
  }
}

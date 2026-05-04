import { Peer } from './entity';
import { DuplicatePeer, UnknownPeer } from './errors';
import { IPeer, IPeerRepository } from './interfaces';
export class IlpPeerAggregate {
  constructor(private readonly repo: IPeerRepository) {}

  async createPeer(input: IPeer): Promise<IPeer> {
    const existing = await this.repo.fetchById(input.peerId);
    if (existing) {
      throw new DuplicatePeer(`Peer with id ${input.peerId} already exists`);
    }

    const entity = Peer.create({
      peerId: input.peerId,
      http: input.http,
      maxPacketAmount: input.maxPacketAmount,
      isActive: input.isActive
    });

    const stored = entity.toObject();
    await this.repo.store(stored);
    return stored;
  }

  async updatePeer(input: IPeer): Promise<IPeer> {
    const existing = await this.repo.fetchById(input.peerId);
    if (!existing) {
      throw new UnknownPeer(`Peer ${input.peerId} not found`);
    }

    const entity = Peer.create({
      peerId: input.peerId,
      http: input.http,
      maxPacketAmount: input.maxPacketAmount,
      isActive: input.isActive
    });

    const stored = entity.toObject();
    await this.repo.update(stored);
    return stored;
  }

  async getPeer(peerId: string): Promise<IPeer | undefined> {
    return this.repo.fetchById(peerId);
  }
}

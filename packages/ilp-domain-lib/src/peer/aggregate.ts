import { Message } from 'common-types-lib';
import { CreatePeerCmd, UpdatePeerCmd } from '../commands';
import { Peer } from './entity';
import { DuplicatePeer, UnknownPeer } from './errors';
import {
  PeerCreatedEvent,
  PeerCreationFailedEvent,
  PeerUpdatedEvent,
  PeerUpdateFailedEvent
} from './events';
import { IPeerRepository } from './interfaces';

// For now we only handle peer lifecycle commands; packet correlation state
// and routing helpers will be added in in subsequent PRs.
export class IlpPeerAggregate {
  constructor(private readonly repo: IPeerRepository) {}

  async handleBatch(cmds: Message[]): Promise<{ events: Message[] }> {
    const outputEvents: Message[] = [];

    for (const cmd of cmds) {
      let event: Message;
      if (cmd.msgName === CreatePeerCmd.name) {
        event = await this.handleCreatePeerCommand(cmd as CreatePeerCmd);
      } else if (cmd.msgName === UpdatePeerCmd.name) {
        event = await this.handleUpdatePeerCommand(cmd as UpdatePeerCmd);
      } else {
        throw new Error(`Unexpected command: ${cmd.msgName}`);
      }

      outputEvents.push(event);
    }

    return { events: outputEvents };
  }

  private async handleCreatePeerCommand(cmd: CreatePeerCmd): Promise<Message> {
    const { correlation, peer: payloadPeer } = cmd.payload;

    try {
      const existingById = await this.repo.fetchById(payloadPeer.peerId);
      if (existingById) {
        throw new DuplicatePeer(
          `Peer with id ${payloadPeer.peerId} already exists`
        );
      }

      const conflict = await this.repo.fetchByStaticAddress(
        payloadPeer.routing.staticIlpAddress
      );
      if (conflict) {
        throw new DuplicatePeer(
          `Peer with staticIlpAddress ${payloadPeer.routing.staticIlpAddress} already exists`
        );
      }

      const entity = Peer.create({
        peerId: payloadPeer.peerId,
        http: payloadPeer.http,
        routing: payloadPeer.routing,
        maxPacketAmount: payloadPeer.maxPacketAmount,
        isActive: payloadPeer.isActive
      });

      const stored = entity.toObject();
      await this.repo.store(stored);

      return new PeerCreatedEvent({ correlation, peer: stored });
    } catch (err) {
      return new PeerCreationFailedEvent({
        correlation,
        peerId: payloadPeer.peerId,
        errorName: (err as Error).constructor.name,
        message: (err as Error).message
      });
    }
  }

  private async handleUpdatePeerCommand(cmd: UpdatePeerCmd): Promise<Message> {
    const { correlation, peer: payloadPeer } = cmd.payload;

    try {
      const existing = await this.repo.fetchById(payloadPeer.peerId);
      if (!existing) {
        throw new UnknownPeer(`Peer ${payloadPeer.peerId} not found`);
      }

      const entity = Peer.create({
        peerId: payloadPeer.peerId,
        http: payloadPeer.http,
        routing: payloadPeer.routing,
        maxPacketAmount: payloadPeer.maxPacketAmount,
        isActive: payloadPeer.isActive
      });

      const stored = entity.toObject();
      await this.repo.update(stored);

      return new PeerUpdatedEvent({ correlation, peer: stored });
    } catch (err) {
      return new PeerUpdateFailedEvent({
        correlation,
        peerId: payloadPeer.peerId,
        errorName: (err as Error).constructor.name,
        message: (err as Error).message
      });
    }
  }
}

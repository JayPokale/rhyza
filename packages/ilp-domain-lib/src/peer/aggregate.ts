import { Message } from 'common-types-lib';
import {
  ExpirePacketCmd,
  ProcessFulfillPacketCmd,
  ProcessRejectPacketCmd,
  StartRemotePaymentCmd,
  StartRemoteQuoteCmd
} from '../commands';
import {
  IPacketJournalRepository,
  IPeeringClient,
  PacketCorrelation
} from '../packet';
import { PacketNotFound } from '../packet/errors';
import { Peer } from './entity';
import { DuplicatePeer, UnknownPeer } from './errors';
import {
  QuoteDeterminedEvent,
  QuoteFailedEvent,
  RemotePaymentConfirmedEvent,
  RemotePaymentFailedEvent
} from './events';
import { IPeer, IPeerRepository } from './interfaces';

export class IlpPeerAggregate {
  constructor(
    private readonly peerRepo: IPeerRepository,
    private readonly packetRepo: IPacketJournalRepository,
    private readonly peeringClient: IPeeringClient
  ) {}

  async createPeer(input: IPeer): Promise<IPeer> {
    const existing = await this.peerRepo.fetchById(input.peerId);
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
    await this.peerRepo.store(stored);
    return stored;
  }

  async updatePeer(input: IPeer): Promise<IPeer> {
    const existing = await this.peerRepo.fetchById(input.peerId);
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
    await this.peerRepo.update(stored);
    return stored;
  }

  async getPeer(peerId: string): Promise<IPeer | undefined> {
    return this.peerRepo.fetchById(peerId);
  }

  async handleBatch(cmds: Message[]): Promise<{ events: Message[] }> {
    const events: Message[] = [];

    for (const cmd of cmds) {
      const emitted = await this.handleCommand(cmd);
      events.push(...emitted);
    }

    return { events };
  }

  private async handleCommand(cmd: Message): Promise<Message[]> {
    switch (cmd.msgName) {
      case StartRemoteQuoteCmd.name:
        return this.handleStartRemoteQuote(cmd as StartRemoteQuoteCmd);
      case StartRemotePaymentCmd.name:
        return this.handleStartRemotePayment(cmd as StartRemotePaymentCmd);
      case ProcessFulfillPacketCmd.name:
        return this.handleProcessFulfillPacket(cmd as ProcessFulfillPacketCmd);
      case ProcessRejectPacketCmd.name:
        return this.handleProcessRejectPacket(cmd as ProcessRejectPacketCmd);
      case ExpirePacketCmd.name:
        return this.handleExpirePacket(cmd as ExpirePacketCmd);
      default:
        throw new Error(`Unexpected command: ${cmd.msgName}`);
    }
  }

  private async handleStartRemoteQuote(
    cmd: StartRemoteQuoteCmd
  ): Promise<Message[]> {
    const payload = cmd.payload;
    const peer = await this.peerRepo.fetchById(payload.peerId);
    if (!peer) {
      throw new UnknownPeer(`Peer ${payload.peerId} not found`);
    }

    const packetId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30_000);

    const correlation = PacketCorrelation.createQuote({
      packetId,
      peerId: peer.peerId,
      paymentIntentId: payload.paymentIntentId,
      expiresAt,
      quoteId: payload.quoteId
    });
    await this.packetRepo.store(correlation.toObject());

    await this.peeringClient.dispatch({
      type: 'QUOTE',
      peerId: peer.peerId,
      packetId,
      paymentIntentId: payload.paymentIntentId,
      quoteId: payload.quoteId,
      destinationIlpAddress: payload.destinationIlpAddress,
      sourceAmount: payload.sourceAmount,
      sourceAssetCode: payload.sourceAssetCode,
      sourceAssetScale: payload.sourceAssetScale
    });

    return [];
  }

  private async handleStartRemotePayment(
    cmd: StartRemotePaymentCmd
  ): Promise<Message[]> {
    const payload = cmd.payload;
    const peer = await this.peerRepo.fetchById(payload.peerId);
    if (!peer) {
      throw new UnknownPeer(`Peer ${payload.peerId} not found`);
    }

    const packetId = crypto.randomUUID();

    const correlation = PacketCorrelation.createPayment({
      packetId,
      peerId: peer.peerId,
      paymentIntentId: payload.paymentIntentId,
      expiresAt: new Date(payload.expiresAt),
      outgoingPaymentId: payload.outgoingPaymentId
    });
    await this.packetRepo.store(correlation.toObject());

    await this.peeringClient.dispatch({
      type: 'PAYMENT',
      peerId: peer.peerId,
      packetId,
      paymentIntentId: payload.paymentIntentId,
      outgoingPaymentId: payload.outgoingPaymentId,
      destinationIlpAddress: payload.destinationIlpAddress,
      amount: payload.amount,
      assetCode: payload.assetCode,
      assetScale: payload.assetScale,
      expiresAt: payload.expiresAt
    });

    return [];
  }

  private async handleProcessFulfillPacket(
    cmd: ProcessFulfillPacketCmd
  ): Promise<Message[]> {
    const payload = cmd.payload;
    const stored = await this.packetRepo.fetchById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .fulfill()
      .toObject();
    await this.packetRepo.update(transitioned);

    if (transitioned.kind === 'PAYMENT') {
      return [
        new RemotePaymentConfirmedEvent({
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          outgoingPaymentId: transitioned.outgoingPaymentId,
          confirmedAt: payload.fulfilledAt
        })
      ];
    }

    // Quote probes don't fulfill
    return [];
  }

  private async handleProcessRejectPacket(
    cmd: ProcessRejectPacketCmd
  ): Promise<Message[]> {
    const payload = cmd.payload;
    const stored = await this.packetRepo.fetchById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .reject()
      .toObject();
    await this.packetRepo.update(transitioned);

    if (transitioned.kind === 'QUOTE') {
      if (
        payload.maxSourceAmount !== undefined &&
        payload.minDeliveryAmount !== undefined &&
        payload.lowEstimatedExchangeRate !== undefined
      ) {
        return [
          new QuoteDeterminedEvent({
            peerId: transitioned.peerId,
            paymentIntentId: transitioned.paymentIntentId,
            quoteId: transitioned.quoteId,
            maxSourceAmount: payload.maxSourceAmount,
            minDeliveryAmount: payload.minDeliveryAmount,
            lowEstimatedExchangeRate: payload.lowEstimatedExchangeRate
          })
        ];
      }

      return [
        new QuoteFailedEvent({
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          quoteId: transitioned.quoteId,
          rejectCode: payload.rejectCode,
          rejectMessage: payload.rejectMessage
        })
      ];
    }

    return [
      new RemotePaymentFailedEvent({
        peerId: transitioned.peerId,
        paymentIntentId: transitioned.paymentIntentId,
        outgoingPaymentId: transitioned.outgoingPaymentId,
        failedAt: payload.rejectedAt,
        reason: 'REJECTED'
      })
    ];
  }

  private async handleExpirePacket(cmd: ExpirePacketCmd): Promise<Message[]> {
    const payload = cmd.payload;
    const stored = await this.packetRepo.fetchById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .expire()
      .toObject();
    await this.packetRepo.update(transitioned);

    if (transitioned.kind === 'QUOTE') {
      return [
        new QuoteFailedEvent({
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          quoteId: transitioned.quoteId,
          expired: true
        })
      ];
    }

    return [
      new RemotePaymentFailedEvent({
        peerId: transitioned.peerId,
        paymentIntentId: transitioned.paymentIntentId,
        outgoingPaymentId: transitioned.outgoingPaymentId,
        failedAt: payload.expiredAt,
        reason: 'EXPIRED'
      })
    ];
  }
}

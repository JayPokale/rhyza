import { IMessage } from 'common-types-lib';
import {
  ExpirePacketCmd,
  ProcessFulfillPacketCmd,
  ProcessPreparePacketCmd,
  ProcessPreparePacketCmdPayload,
  ProcessRejectPacketCmd,
  RespondToRemoteQuoteCmd,
  StartRemotePaymentCmd,
  StartRemoteQuoteCmd
} from '../commands';
import { IPeeringClient, PacketCorrelation } from '../packet';
import { PacketNotFound } from '../packet/errors';
import { Peer } from './entity';
import { DuplicatePeer, UnknownPeer } from './errors';
import {
  ILPQuoteReceivedEvent,
  QuoteFailedEvent,
  ILPPaymentConfirmedEvent,
  ILPPaymentFailedEvent,
  ILPQuoteRequestReceivedEvent
} from './events';
import { IPeer, IPeerRepository } from './interfaces';

// ILP reject codes for the receiving quote flow.
// F99 (application error) is the expected quote response: the unfulfillable
// probe is answered with a reject carrying the destination amount. T00
// (internal error) is the generic "could not respond" reject
// TODO: Move these in the future
const REJECT_CODE_QUOTE_RESPONSE = 'F99';
const REJECT_CODE_INTERNAL = 'T00';

export class IlpPeerAggregate {
  constructor(
    private readonly peerRepo: IPeerRepository,
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
      isActive: input.isActive
    });

    const stored = entity.toObject();
    await this.peerRepo.update(stored);
    return stored;
  }

  async getPeer(peerId: string): Promise<IPeer | undefined> {
    return this.peerRepo.fetchById(peerId);
  }

  async handleBatch(cmds: IMessage[]): Promise<{ events: IMessage[] }> {
    const events: IMessage[] = [];

    for (const cmd of cmds) {
      const emitted = await this.handleCommand(cmd);
      events.push(...emitted);
    }

    return { events };
  }

  private async handleCommand(cmd: IMessage): Promise<IMessage[]> {
    switch (cmd.msgName) {
      case StartRemoteQuoteCmd.name:
        return this.handleStartRemoteQuote(cmd as StartRemoteQuoteCmd);
      case StartRemotePaymentCmd.name:
        return this.handleStartRemotePayment(cmd as StartRemotePaymentCmd);
      case ProcessPreparePacketCmd.name:
        return this.handleProcessPreparePacket(cmd as ProcessPreparePacketCmd);
      case RespondToRemoteQuoteCmd.name:
        return this.handleRespondToRemoteQuote(cmd as RespondToRemoteQuoteCmd);
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
  ): Promise<IMessage[]> {
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
      quoteId: payload.quoteId,
      requestId: cmd.requestId
    });
    await this.peerRepo.storePacket(correlation.toObject());

    await this.peeringClient.dispatch({
      type: 'QUOTE',
      peerId: peer.peerId,
      packetId,
      paymentIntentId: payload.paymentIntentId,
      quoteId: payload.quoteId,
      destinationIlpAddress: payload.destinationIlpAddress,
      sourceAmount: payload.sourceAmount,
      sourceAssetCode: payload.sourceAssetCode,
      sourceAssetScale: payload.sourceAssetScale,
      expiresAt: expiresAt.toISOString()
    });

    return [];
  }

  private async handleStartRemotePayment(
    cmd: StartRemotePaymentCmd
  ): Promise<IMessage[]> {
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
      paymentId: payload.paymentId
    });
    await this.peerRepo.storePacket(correlation.toObject());

    await this.peeringClient.dispatch({
      type: 'PAYMENT',
      peerId: peer.peerId,
      packetId,
      paymentIntentId: payload.paymentIntentId,
      paymentId: payload.paymentId,
      destinationIlpAddress: payload.destinationIlpAddress,
      amount: payload.amount,
      assetCode: payload.assetCode,
      assetScale: payload.assetScale,
      expiresAt: payload.expiresAt
    });

    return [];
  }

  private async handleProcessPreparePacket(
    cmd: ProcessPreparePacketCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;

    // Without STREAM decode, "decode" means checking the fields the connector
    // handed us are usable as a quoting probe.
    // TODO: Replace when STREAM decode is implemented
    if (!this.isDecodableProbe(payload)) {
      await this.rejectInbound(payload.peerId, payload.packetId);
      return [];
    }

    const peer = await this.peerRepo.fetchById(payload.peerId);
    if (!peer || peer.isActive === false) {
      await this.rejectInbound(payload.peerId, payload.packetId);
      return [];
    }

    return [
      new ILPQuoteRequestReceivedEvent({
        peerId: peer.peerId,
        packetId: payload.packetId,
        destinationIlpAddress: payload.destinationIlpAddress,
        incomingAmount: payload.amount,
        expiresAt: payload.expiresAt
      })
    ];
  }

  private async handleRespondToRemoteQuote(
    cmd: RespondToRemoteQuoteCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;

    if (payload.destinationAmount === undefined) {
      await this.rejectInbound(payload.peerId, payload.packetId);
      return [];
    }

    await this.peeringClient.dispatchReject({
      peerId: payload.peerId,
      packetId: payload.packetId,
      rejectCode: REJECT_CODE_QUOTE_RESPONSE,
      destinationAmount: payload.destinationAmount
    });
    return [];
  }

  private isDecodableProbe(payload: ProcessPreparePacketCmdPayload): boolean {
    return (
      typeof payload.destinationIlpAddress === 'string' &&
      payload.destinationIlpAddress.length > 0 &&
      typeof payload.amount === 'string' &&
      /^\d+$/.test(payload.amount)
    );
  }

  private async rejectInbound(peerId: string, packetId: string): Promise<void> {
    await this.peeringClient.dispatchReject({
      peerId,
      packetId,
      rejectCode: REJECT_CODE_INTERNAL
    });
  }

  private async handleProcessFulfillPacket(
    cmd: ProcessFulfillPacketCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;
    const stored = await this.peerRepo.fetchPacketById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .fulfill()
      .toObject();
    await this.peerRepo.updatePacket(transitioned);

    if (transitioned.kind === 'PAYMENT') {
      return [
        new ILPPaymentConfirmedEvent({
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          paymentId: transitioned.paymentId,
          confirmedAt: payload.fulfilledAt
        })
      ];
    }

    // Quote probes don't fulfill
    return [];
  }

  private async handleProcessRejectPacket(
    cmd: ProcessRejectPacketCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;
    const stored = await this.peerRepo.fetchPacketById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .reject()
      .toObject();
    await this.peerRepo.updatePacket(transitioned);

    if (transitioned.kind === 'QUOTE') {
      if (payload.destinationAmount !== undefined) {
        return [
          new ILPQuoteReceivedEvent(
            {
              peerId: transitioned.peerId,
              paymentIntentId: transitioned.paymentIntentId,
              quoteId: transitioned.quoteId,
              destinationAmount: payload.destinationAmount
            },
            transitioned.requestId
          )
        ];
      }

      return [
        new QuoteFailedEvent(
          {
            peerId: transitioned.peerId,
            paymentIntentId: transitioned.paymentIntentId,
            quoteId: transitioned.quoteId,
            rejectCode: payload.rejectCode,
            rejectMessage: payload.rejectMessage
          },
          transitioned.requestId
        )
      ];
    }

    return [
      new ILPPaymentFailedEvent({
        peerId: transitioned.peerId,
        paymentIntentId: transitioned.paymentIntentId,
        paymentId: transitioned.paymentId,
        failedAt: payload.rejectedAt,
        reason: 'REJECTED'
      })
    ];
  }

  private async handleExpirePacket(cmd: ExpirePacketCmd): Promise<IMessage[]> {
    const payload = cmd.payload;
    const stored = await this.peerRepo.fetchPacketById(payload.packetId);
    if (!stored) {
      throw new PacketNotFound(`Packet ${payload.packetId} not found`);
    }
    const transitioned = PacketCorrelation.fromObject(stored)
      .expire()
      .toObject();
    await this.peerRepo.updatePacket(transitioned);

    if (transitioned.kind === 'QUOTE') {
      return [
        new QuoteFailedEvent(
          {
            peerId: transitioned.peerId,
            paymentIntentId: transitioned.paymentIntentId,
            quoteId: transitioned.quoteId,
            expired: true
          },
          transitioned.requestId
        )
      ];
    }

    return [
      new ILPPaymentFailedEvent({
        peerId: transitioned.peerId,
        paymentIntentId: transitioned.paymentIntentId,
        paymentId: transitioned.paymentId,
        failedAt: payload.expiredAt,
        reason: 'EXPIRED'
      })
    ];
  }
}

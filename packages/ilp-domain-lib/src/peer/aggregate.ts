import { IMessage } from 'common-types-lib';
import {
  ActivatePeerCmd,
  CreatePeerCmd,
  DeactivatePeerCmd,
  ExpirePacketCmd,
  FulfillInboundPaymentCmd,
  ProcessFulfillPacketCmd,
  ProcessPreparePacketCmd,
  ProcessPreparePacketCmdPayload,
  ProcessRejectPacketCmd,
  RejectInboundPaymentCmd,
  RespondToRemoteQuoteCmd,
  StartRemotePaymentCmd,
  StartRemoteQuoteCmd,
  UpdatePeerCmd
} from '../commands';
import {
  IPeeringClient,
  IInboundPacketReplyHandle,
  PacketCorrelation
} from '../packet';
import { PacketNotFound } from '../packet/errors';
import {
  decodeInboundStreamPrepare,
  encodeOutgoingStreamPrepare,
  ResolveStreamCredentials,
  sha256
} from '../stream';
import { Peer } from './entity';
import { DuplicatePeer, UnknownPeer } from './errors';
import {
  ILPPeerCreatedEvent,
  ILPPeerCreationFailedEvent,
  ILPPeerUpdatedEvent,
  ILPPeerUpdateFailedEvent,
  ILPQuoteReceivedEvent,
  ILPQuoteFailedEvent,
  ILPPaymentConfirmedEvent,
  ILPPaymentFailedEvent,
  ILPQuoteRequestReceivedEvent,
  ILPPaymentReceivedEvent,
  ILPPaymentFulfillmentSentEvent,
  ILPPaymentFulfillmentFailedEvent
} from './events';
import { IPeer, IPeerRepository } from './interfaces';

// ILP reject codes for inbound prepare / quote / receive-fail paths.
// F99 (application error) is the expected quote response: the unfulfillable
// probe is answered with a reject carrying the destination amount.
// T00 (internal error) is the generic temporary reject (inactive peer,
// quote calc failure, post-accept receive fail)
// F06 / F03 are final: bad STREAM credentials / invalid amount.
// R00 is connector wire timeout (no callback before expiresAt).
// TODO: Move these in the future
const REJECT_CODE_QUOTE_RESPONSE = 'F99';
const REJECT_CODE_INTERNAL = 'T00';
const REJECT_CODE_UNEXPECTED_PAYMENT = 'F06';
const REJECT_CODE_INVALID_AMOUNT = 'F03';
const REJECT_CODE_TRANSFER_TIMED_OUT = 'R00';

export class IlpPeerAggregate {
  constructor(
    private readonly peerRepo: IPeerRepository,
    private readonly peeringClient: IPeeringClient,
    private readonly resolveStreamCredentials: ResolveStreamCredentials
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

  async listPeers(): Promise<IPeer[]> {
    return this.peerRepo.fetchAll();
  }

  private async handleCreatePeerCmd(cmd: CreatePeerCmd): Promise<IMessage[]> {
    try {
      const peer = await this.createPeer({
        peerId: cmd.payload.peerId,
        http: cmd.payload.http,
        isActive: cmd.payload.isActive
      });
      return [
        new ILPPeerCreatedEvent(
          { peerId: peer.peerId, http: peer.http, isActive: peer.isActive },
          cmd.requestId
        )
      ];
    } catch (err) {
      return [
        new ILPPeerCreationFailedEvent(
          {
            peerId: cmd.payload.peerId,
            errorName: (err as Error).constructor.name,
            message: (err as Error).message
          },
          cmd.requestId
        )
      ];
    }
  }

  private async handleUpdatePeerCmd(cmd: UpdatePeerCmd): Promise<IMessage[]> {
    try {
      const peer = await this.updatePeer({
        peerId: cmd.payload.peerId,
        http: cmd.payload.http,
        isActive: cmd.payload.isActive
      });
      return [
        new ILPPeerUpdatedEvent(
          { peerId: peer.peerId, http: peer.http, isActive: peer.isActive },
          cmd.requestId
        )
      ];
    } catch (err) {
      return [
        new ILPPeerUpdateFailedEvent(
          {
            peerId: cmd.payload.peerId,
            errorName: (err as Error).constructor.name,
            message: (err as Error).message
          },
          cmd.requestId
        )
      ];
    }
  }

  // Activation state mirrors PAL (PAL is the source of truth)
  private async setPeerActive(
    peerId: string,
    isActive: boolean,
    requestId: string
  ): Promise<IMessage[]> {
    try {
      const existing = await this.peerRepo.fetchById(peerId);
      if (!existing) {
        throw new UnknownPeer(`Peer ${peerId} not found`);
      }

      const peer = await this.updatePeer({
        peerId: existing.peerId,
        http: existing.http,
        isActive
      });
      return [
        new ILPPeerUpdatedEvent(
          { peerId: peer.peerId, http: peer.http, isActive: peer.isActive },
          requestId
        )
      ];
    } catch (err) {
      return [
        new ILPPeerUpdateFailedEvent(
          {
            peerId,
            errorName: (err as Error).constructor.name,
            message: (err as Error).message
          },
          requestId
        )
      ];
    }
  }

  private async handleActivatePeerCmd(
    cmd: ActivatePeerCmd
  ): Promise<IMessage[]> {
    return this.setPeerActive(cmd.payload.peerId, true, cmd.requestId);
  }

  private async handleDeactivatePeerCmd(
    cmd: DeactivatePeerCmd
  ): Promise<IMessage[]> {
    return this.setPeerActive(cmd.payload.peerId, false, cmd.requestId);
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
      case CreatePeerCmd.name:
        return this.handleCreatePeerCmd(cmd as CreatePeerCmd);
      case UpdatePeerCmd.name:
        return this.handleUpdatePeerCmd(cmd as UpdatePeerCmd);
      case ActivatePeerCmd.name:
        return this.handleActivatePeerCmd(cmd as ActivatePeerCmd);
      case DeactivatePeerCmd.name:
        return this.handleDeactivatePeerCmd(cmd as DeactivatePeerCmd);
      case StartRemoteQuoteCmd.name:
        return this.handleStartRemoteQuote(cmd as StartRemoteQuoteCmd);
      case StartRemotePaymentCmd.name:
        return this.handleStartRemotePayment(cmd as StartRemotePaymentCmd);
      case ProcessPreparePacketCmd.name:
        return this.handleProcessPreparePacket(cmd as ProcessPreparePacketCmd);
      case RespondToRemoteQuoteCmd.name:
        return this.handleRespondToRemoteQuote(cmd as RespondToRemoteQuoteCmd);
      case FulfillInboundPaymentCmd.name:
        return this.handleFulfillInboundPayment(
          cmd as FulfillInboundPaymentCmd
        );
      case RejectInboundPaymentCmd.name:
        return this.handleRejectInboundPayment(cmd as RejectInboundPaymentCmd);
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
    const encoded = encodeOutgoingStreamPrepare({
      sharedSecret: Buffer.from(payload.sharedSecret, 'base64url'),
      amount: payload.amount
    });

    const correlation = PacketCorrelation.createPayment({
      packetId,
      peerId: peer.peerId,
      paymentIntentId: payload.paymentIntentId,
      expiresAt: new Date(payload.expiresAt),
      paymentId: payload.paymentId,
      requestId: cmd.requestId,
      executionCondition: encoded.executionCondition.toString('base64')
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
      expiresAt: payload.expiresAt,
      sharedSecret: payload.sharedSecret,
      executionCondition: encoded.executionCondition.toString('base64'),
      data: encoded.data.toString('base64')
    });

    return [];
  }

  private async handleProcessPreparePacket(
    cmd: ProcessPreparePacketCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;

    const peer = await this.peerRepo.fetchById(payload.peerId);
    if (!peer || peer.isActive === false) {
      await this.rejectInbound(payload, REJECT_CODE_INTERNAL);
      return [];
    }

    const resolved = await this.resolveStreamCredentials(
      payload.destinationIlpAddress
    );
    if (!resolved) {
      await this.rejectInbound(payload, REJECT_CODE_UNEXPECTED_PAYMENT);
      return [];
    }

    if (!/^\d+$/.test(payload.amount)) {
      await this.rejectInbound(payload, REJECT_CODE_INVALID_AMOUNT);
      return [];
    }

    const stream = decodeInboundStreamPrepare({
      sharedSecret: resolved.sharedSecret,
      executionCondition: Buffer.from(payload.executionCondition, 'base64'),
      data: Buffer.from(payload.data ?? '', 'base64')
    });

    if (stream.fulfillable && stream.fulfillment) {
      const paymentId = crypto.randomUUID();
      const requestId = cmd.requestId ?? crypto.randomUUID();
      const correlation = PacketCorrelation.createPayment({
        packetId: payload.packetId,
        peerId: peer.peerId,
        paymentIntentId: resolved.paymentIntentId,
        expiresAt: new Date(payload.expiresAt),
        // Inbound payment id is allocated locally until Payments BC owns it.
        paymentId,
        requestId,
        fulfillment: stream.fulfillment.toString('base64')
      });
      await this.peerRepo.storePacket(correlation.toObject());
      await this.peerRepo.storeInboundReplyHandle({
        packetId: payload.packetId,
        peerId: payload.peerId,
        replyHandle: payload.replyHandle
      });
      return [
        new ILPPaymentReceivedEvent({
          peerId: peer.peerId,
          packetId: payload.packetId,
          paymentIntentId: resolved.paymentIntentId,
          paymentId,
          sourceAmount: payload.amount,
          requestId,
          expiresAt: payload.expiresAt
        })
      ];
    }

    await this.peerRepo.storeInboundReplyHandle({
      packetId: payload.packetId,
      peerId: payload.peerId,
      replyHandle: payload.replyHandle
    });

    return [
      new ILPQuoteRequestReceivedEvent({
        peerId: peer.peerId,
        packetId: payload.packetId,
        paymentIntentId: resolved.paymentIntentId,
        incomingAmount: payload.amount,
        expiresAt: payload.expiresAt
      })
    ];
  }

  private async handleRespondToRemoteQuote(
    cmd: RespondToRemoteQuoteCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;
    const replyHandle = await this.peerRepo.fetchInboundReplyHandle(
      payload.packetId
    );
    if (!replyHandle) {
      return [];
    }

    if (payload.destinationAmount === undefined) {
      await this.rejectInbound(replyHandle, REJECT_CODE_INTERNAL);
      return [];
    }

    await this.peeringClient.dispatchReject({
      peerId: payload.peerId,
      packetId: payload.packetId,
      replyHandle: replyHandle.replyHandle,
      rejectCode: REJECT_CODE_QUOTE_RESPONSE,
      destinationAmount: payload.destinationAmount
    });
    await this.peerRepo.deleteInboundReplyHandle(payload.packetId);
    return [];
  }

  private async handleFulfillInboundPayment(
    cmd: FulfillInboundPaymentCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;
    const failedAt = new Date().toISOString();
    const fail = (reason: string, paymentId: string) => [
      new ILPPaymentFulfillmentFailedEvent({
        peerId: payload.peerId,
        packetId: payload.packetId,
        paymentIntentId: payload.paymentIntentId,
        paymentId,
        inboundPaymentId: payload.inboundPaymentId,
        failedAt,
        reason,
        requestId: payload.requestId
      })
    ];

    const stored = await this.peerRepo.fetchPacketById(payload.packetId);
    if (!stored || stored.kind !== 'PAYMENT') {
      return fail('packet_not_found', payload.inboundPaymentId);
    }

    if (stored.state !== 'PENDING') {
      return fail(`packet_${stored.state.toLowerCase()}`, stored.paymentId);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      const expired = PacketCorrelation.fromObject(stored).expire().toObject();
      await this.peerRepo.updatePacket(expired);
      await this.peerRepo.deleteInboundReplyHandle(payload.packetId);
      return fail('packet_expired', stored.paymentId);
    }

    if (!stored.fulfillment) {
      return fail('fulfillment_missing', stored.paymentId);
    }

    const replyHandle = await this.peerRepo.fetchInboundReplyHandle(
      payload.packetId
    );
    if (!replyHandle) {
      return fail('reply_handle_missing', stored.paymentId);
    }

    try {
      await this.peeringClient.dispatchFulfill({
        peerId: payload.peerId,
        packetId: payload.packetId,
        replyHandle: replyHandle.replyHandle,
        fulfillment: stored.fulfillment
      });
    } catch (err) {
      return fail(
        err instanceof Error ? err.message : 'dispatch_failed',
        stored.paymentId
      );
    }

    const fulfilled = PacketCorrelation.fromObject(stored).fulfill().toObject();
    await this.peerRepo.updatePacket(fulfilled);
    await this.peerRepo.deleteInboundReplyHandle(payload.packetId);

    return [
      new ILPPaymentFulfillmentSentEvent({
        peerId: payload.peerId,
        packetId: payload.packetId,
        paymentIntentId: payload.paymentIntentId,
        paymentId: stored.paymentId,
        inboundPaymentId: payload.inboundPaymentId,
        fulfilledAt: new Date().toISOString(),
        requestId: payload.requestId
      })
    ];
  }

  private async handleRejectInboundPayment(
    cmd: RejectInboundPaymentCmd
  ): Promise<IMessage[]> {
    const payload = cmd.payload;
    const replyHandle = await this.peerRepo.fetchInboundReplyHandle(
      payload.packetId
    );
    if (!replyHandle) {
      return [];
    }

    const stored = await this.peerRepo.fetchPacketById(payload.packetId);
    if (stored?.state === 'PENDING') {
      const rejected = PacketCorrelation.fromObject(stored).reject().toObject();
      await this.peerRepo.updatePacket(rejected);
    }

    await this.rejectInbound(
      replyHandle,
      payload.rejectCode ?? REJECT_CODE_INTERNAL
    );
    return [];
  }

  private async rejectInbound(
    context: ProcessPreparePacketCmdPayload | IInboundPacketReplyHandle,
    rejectCode: string = REJECT_CODE_INTERNAL
  ): Promise<void> {
    await this.peerRepo.deleteInboundReplyHandle(context.packetId);
    await this.peeringClient.dispatchReject({
      peerId: context.peerId,
      packetId: context.packetId,
      replyHandle: context.replyHandle,
      rejectCode
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

    if (stored.kind === 'PAYMENT') {
      if (stored.expiresAt.getTime() <= Date.now()) {
        const expired = PacketCorrelation.fromObject(stored)
          .expire()
          .toObject();
        await this.peerRepo.updatePacket(expired);
        return [
          new ILPPaymentFailedEvent(
            {
              peerId: stored.peerId,
              paymentIntentId: stored.paymentIntentId,
              paymentId: stored.paymentId,
              failedAt: payload.fulfilledAt,
              reason: 'EXPIRED'
            },
            stored.requestId
          )
        ];
      }

      const fulfillment = payload.fulfillment
        ? Buffer.from(payload.fulfillment, 'base64')
        : Buffer.alloc(0);
      const condition = stored.executionCondition
        ? Buffer.from(stored.executionCondition, 'base64')
        : Buffer.alloc(0);
      const hashMatches =
        fulfillment.length > 0 &&
        condition.length > 0 &&
        sha256(fulfillment).equals(condition);

      if (!hashMatches) {
        const rejected = PacketCorrelation.fromObject(stored)
          .reject()
          .toObject();
        await this.peerRepo.updatePacket(rejected);
        return [
          new ILPPaymentFailedEvent(
            {
              peerId: stored.peerId,
              paymentIntentId: stored.paymentIntentId,
              paymentId: stored.paymentId,
              failedAt: payload.fulfilledAt,
              reason: 'REJECTED'
            },
            stored.requestId
          )
        ];
      }
    }

    const transitioned = PacketCorrelation.fromObject(stored)
      .fulfill()
      .toObject();
    await this.peerRepo.updatePacket(transitioned);

    if (transitioned.kind === 'PAYMENT') {
      return [
        new ILPPaymentConfirmedEvent(
          {
            peerId: transitioned.peerId,
            paymentIntentId: transitioned.paymentIntentId,
            paymentId: transitioned.paymentId,
            confirmedAt: payload.fulfilledAt
          },
          transitioned.requestId
        )
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
        new ILPQuoteFailedEvent(
          {
            peerId: transitioned.peerId,
            paymentIntentId: transitioned.paymentIntentId,
            quoteId: transitioned.quoteId,
            rejectCode: payload.rejectCode,
            rejectMessage: payload.rejectMessage,
            expired: payload.rejectCode === REJECT_CODE_TRANSFER_TIMED_OUT
          },
          transitioned.requestId
        )
      ];
    }

    return [
      new ILPPaymentFailedEvent(
        {
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          paymentId: transitioned.paymentId,
          failedAt: payload.rejectedAt,
          reason:
            payload.rejectCode === REJECT_CODE_TRANSFER_TIMED_OUT
              ? 'EXPIRED'
              : 'REJECTED',
          rejectCode: payload.rejectCode,
          rejectMessage: payload.rejectMessage
        },
        transitioned.requestId
      )
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
        new ILPQuoteFailedEvent(
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
      new ILPPaymentFailedEvent(
        {
          peerId: transitioned.peerId,
          paymentIntentId: transitioned.paymentIntentId,
          paymentId: transitioned.paymentId,
          failedAt: payload.expiredAt,
          reason: 'EXPIRED'
        },
        transitioned.requestId
      )
    ];
  }
}

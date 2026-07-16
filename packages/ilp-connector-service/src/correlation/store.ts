import {
  InboundReplyTarget,
  OutboundPacketCorrelation
} from './types';

export interface ITransportCorrelationStore {
  createInboundReplyHandle(target: InboundReplyTarget): Promise<string>;
  resolveInboundReplyHandle(
    replyHandle: string
  ): Promise<InboundReplyTarget | undefined>;
  deleteInboundReplyHandle(replyHandle: string): Promise<void>;

  storeOutboundCorrelation(
    packetId: string,
    correlation: OutboundPacketCorrelation
  ): Promise<void>;
  hasOutboundCorrelation(packetId: string): Promise<boolean>;
  takeOutboundCorrelation(
    packetId: string
  ): Promise<OutboundPacketCorrelation | undefined>;

  // Shared outbound expiry index (Redis ZSET otherwise in-memory in tests).
  // Any replica can claim due packetIds. takeOutboundCorrelation still decides
  // the winner if a late callback races the worker.
  scheduleOutboundExpiry(packetId: string, expiresAt: string): Promise<void>;
  cancelOutboundExpiry(packetId: string): Promise<void>;
  claimExpiredOutbound(limit?: number): Promise<string[]>;
}

export const PacketState = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type PacketState = keyof typeof PacketState;

interface BasePacketCorrelation {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  expiresAt: Date;
  state: PacketState;
}

interface QuotePacketCorrelation extends BasePacketCorrelation {
  kind: 'QUOTE';
  quoteId: string;
  requestId: string;
}

interface PaymentPacketCorrelation extends BasePacketCorrelation {
  kind: 'PAYMENT';
  paymentId: string;
  requestId: string;
  // Optional because this type covers both directions. Inbound fulfillable
  // packets store the base64 STREAM fulfillment here for a later fulfill
  // reply. Outgoing prepares leave it unset.
  fulfillment?: string;
  // Outbound prepares store the base64 execution condition so a later
  // fulfill can be hashed against it.
  executionCondition?: string;
}

export type IPacketCorrelation =
  | QuotePacketCorrelation
  | PaymentPacketCorrelation;

// Connector-issued id for answering an inbound prepare later. Domain stores
// and forwards it and the connector resolves how to deliver on the wire.
export interface IInboundPacketReplyHandle {
  packetId: string;
  peerId: string;
  replyHandle: string;
}

// To be implemented by the adapter for sending packets.
export interface IPeeringClient {
  dispatch(input: PacketDispatch): Promise<void>;
  dispatchReject(input: RejectDispatch): Promise<void>;
  dispatchFulfill(input: FulfillDispatch): Promise<void>;
}

export interface InboundReplyDispatch {
  peerId: string;
  packetId: string;
  replyHandle: string;
}

export interface FulfillDispatch extends InboundReplyDispatch {
  fulfillment: string;
  data?: string;
}

export interface RejectDispatch extends InboundReplyDispatch {
  rejectCode: string;
  rejectMessage?: string;
  triggeredBy?: string;
  destinationAmount?: string;
}

export type PacketDispatch = QuoteDispatch | PaymentDispatch;

export interface QuoteDispatch {
  type: 'QUOTE';
  peerId: string;
  packetId: string;
  paymentIntentId: string;
  quoteId: string;
  destinationIlpAddress: string;
  sourceAmount: string;
  sourceAssetCode: string;
  sourceAssetScale: number;
  expiresAt: string;
}

export interface PaymentDispatch {
  type: 'PAYMENT';
  peerId: string;
  packetId: string;
  paymentIntentId: string;
  paymentId: string;
  destinationIlpAddress: string;
  amount: string;
  assetCode: string;
  assetScale: number;
  expiresAt: string;
  sharedSecret: string;
  executionCondition: string;
  data: string;
}

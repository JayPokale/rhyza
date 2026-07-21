// How to deliver an inbound reply on the wire. Stays in the connector layer.
export interface HttpInboundDelivery {
  kind: 'http';
  callbackUrl: string;
}

export type InboundDelivery = HttpInboundDelivery;

export interface InboundReplyTarget {
  peerId: string;
  packetId: string;
  expiresAt: string;
  delivery: InboundDelivery;
}

export interface OutboundPacketCorrelation {
  peerId: string;
  paymentIntentId: string;
  expiresAt: string;
}

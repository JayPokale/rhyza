export const PacketState = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type PacketState = keyof typeof PacketState;

export interface IPacketCorrelation {
  packetId: string;
  requestId: string;
  paymentIntentRef: string;
  peerId: string;
  quoteId?: string;
  outgoingPaymentId?: string;
  ledgerTransferId?: string;
  expiresAt: Date;
  state: PacketState;
  rejectCode?: string;
  rejectMessage?: string;
  // Who caused the ILP reject (remote peer, internal or another hop)
  // TODO: Make enum or remove?
  rejectTriggeredBy?: string; 
  fulfilledAt?: Date;
  rejectedAt?: Date;
  expiredAt?: Date;
}

export interface IPacketJournalRepository {
  fetchByIds(packetIds: string[]): Promise<IPacketCorrelation[]>;
  storeMany(packets: IPacketCorrelation[]): Promise<void>;
  updateMany(packets: IPacketCorrelation[]): Promise<void>;
}

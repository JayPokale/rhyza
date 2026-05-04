export const PacketState = {
  PENDING: 'PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
} as const;
export type PacketState = keyof typeof PacketState;

export interface IPacketCorrelation {
  packetId: string;
  peerId: string;
  paymentIntentId: string;
  expiresAt: Date;
  state: PacketState;
}

export interface IPacketJournalRepository {
  fetchByIds(packetIds: string[]): Promise<IPacketCorrelation[]>;
  storeMany(packets: IPacketCorrelation[]): Promise<void>;
  updateMany(packets: IPacketCorrelation[]): Promise<void>;
}

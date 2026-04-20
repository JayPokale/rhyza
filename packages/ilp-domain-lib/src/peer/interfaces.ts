// ILP peer configuration
// The ILP BC only owns the connector configuration needed to exchange packets
// with the peer. `peerId` references the PAL peer.

export interface PeerHttpOutgoingConfig {
  endpoint: string;
  authToken: string;
}

export interface PeerHttpIncomingConfig {
  authToken?: string;
}

export interface PeerHttpConfig {
  outgoing: PeerHttpOutgoingConfig;
  incoming?: PeerHttpIncomingConfig;
}

export interface PeerRoutingConfig {
  staticIlpAddress: string;
  routePrefixes: string[];
}

export interface IPeer {
  peerId: string;
  http: PeerHttpConfig;
  routing: PeerRoutingConfig;
  maxPacketAmount?: bigint;
  isActive?: boolean;
}

export interface IPeerRepository {
  fetchByIds(peerIds: string[]): Promise<IPeer[]>;
  fetchByStaticAddresses(staticIlpAddresses: string[]): Promise<IPeer[]>;
  storeMany(peers: IPeer[]): Promise<void>;
  updateMany(peers: IPeer[]): Promise<void>;
}

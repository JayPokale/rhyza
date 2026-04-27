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
  fetchById(peerId: string): Promise<IPeer | undefined>;
  fetchByStaticAddress(staticIlpAddress: string): Promise<IPeer | undefined>;
  store(peer: IPeer): Promise<void>;
  update(peer: IPeer): Promise<void>;
}

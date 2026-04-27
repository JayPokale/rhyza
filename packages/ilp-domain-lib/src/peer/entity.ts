import {
  InvalidAuthToken,
  InvalidHTTPEndpoint,
  InvalidMaxPacketAmount,
  InvalidPeerRoutePrefix,
  InvalidStaticIlpAddress
} from './errors';
import { IPeer, PeerHttpConfig, PeerRoutingConfig } from './interfaces';

// Allowed chars per the ILP address spec: [A-Za-z0-9_~-].
const ILP_ADDRESS_PATTERN = /^([a-z0-9_~-]+)(\.[a-z0-9_~-]+)+$/i;

export class Peer implements IPeer {
  private constructor(
    public readonly peerId: string,
    public readonly http: PeerHttpConfig,
    public readonly routing: PeerRoutingConfig,
    public readonly maxPacketAmount: bigint | undefined,
    public readonly isActive: boolean | undefined
  ) {}

  static create(args: {
    peerId: string;
    http: PeerHttpConfig;
    routing: PeerRoutingConfig;
    maxPacketAmount?: bigint;
    isActive?: boolean;
  }): Peer {
    Peer.assertStaticIlpAddress(args.routing.staticIlpAddress);
    Peer.assertHttpEndpoint(args.http.outgoing.endpoint);
    Peer.assertAuthToken(
      args.http.outgoing.authToken,
      'http.outgoing.authToken'
    );

    if (args.http.incoming?.authToken !== undefined) {
      Peer.assertAuthToken(
        args.http.incoming.authToken,
        'http.incoming.authToken'
      );
    }

    for (const prefix of args.routing.routePrefixes) {
      Peer.assertRoutePrefix(prefix);
    }

    if (args.maxPacketAmount !== undefined && args.maxPacketAmount <= 0n) {
      throw new InvalidMaxPacketAmount(
        `maxPacketAmount must be greater than 0, received ${args.maxPacketAmount}`
      );
    }

    return new Peer(
      args.peerId,
      args.http,
      args.routing,
      args.maxPacketAmount,
      args.isActive
    );
  }

  static fromObject(peer: IPeer): Peer {
    return Peer.create({
      peerId: peer.peerId,
      http: peer.http,
      routing: peer.routing,
      maxPacketAmount: peer.maxPacketAmount,
      isActive: peer.isActive
    });
  }

  toObject(): IPeer {
    return {
      peerId: this.peerId,
      http: this.http,
      routing: this.routing,
      maxPacketAmount: this.maxPacketAmount,
      isActive: this.isActive
    };
  }

  private static assertStaticIlpAddress(value: string): void {
    if (!ILP_ADDRESS_PATTERN.test(value)) {
      throw new InvalidStaticIlpAddress(`Invalid static ILP address: ${value}`);
    }
  }

  private static assertHttpEndpoint(value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new InvalidHTTPEndpoint(`Invalid HTTP endpoint: ${value}`);
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new InvalidHTTPEndpoint(
        `Invalid HTTP endpoint protocol for ${value}: ${parsed.protocol}`
      );
    }
  }

  private static assertAuthToken(value: string, field: string): void {
    if (value.trim().length === 0) {
      throw new InvalidAuthToken(`${field} must not be empty`);
    }
  }

  private static assertRoutePrefix(value: string): void {
    if (!ILP_ADDRESS_PATTERN.test(value)) {
      throw new InvalidPeerRoutePrefix(`Invalid route prefix: ${value}`);
    }
  }
}

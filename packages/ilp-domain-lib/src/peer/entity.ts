import {
  InvalidAuthToken,
  InvalidHTTPEndpoint,
  InvalidMaxPacketAmount
} from './errors';
import { IPeer, PeerHttpConfig } from './interfaces';

export class Peer implements IPeer {
  private constructor(
    public readonly peerId: string,
    public readonly http: PeerHttpConfig,
    public readonly maxPacketAmount: bigint | undefined,
    public readonly isActive: boolean | undefined
  ) {}

  static create(args: {
    peerId: string;
    http: PeerHttpConfig;
    maxPacketAmount?: bigint;
    isActive?: boolean;
  }): Peer {
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

    if (args.maxPacketAmount !== undefined && args.maxPacketAmount <= 0n) {
      throw new InvalidMaxPacketAmount(
        `maxPacketAmount must be greater than 0, received ${args.maxPacketAmount}`
      );
    }

    return new Peer(
      args.peerId,
      args.http,
      args.maxPacketAmount,
      args.isActive
    );
  }

  static fromObject(peer: IPeer): Peer {
    return Peer.create({
      peerId: peer.peerId,
      http: peer.http,
      maxPacketAmount: peer.maxPacketAmount,
      isActive: peer.isActive
    });
  }

  toObject(): IPeer {
    return {
      peerId: this.peerId,
      http: this.http,
      maxPacketAmount: this.maxPacketAmount,
      isActive: this.isActive
    };
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
}

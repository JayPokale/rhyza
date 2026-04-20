export interface RoutingPeer {
  peerId: string;
  routePrefixes: string[];
}

export interface ResolvedRoute {
  peerId: string;
  matchedPrefix: string;
}

import { IPeer, IPeerService } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';

export class PalPeerAdapter implements IPeerService {
  private _palClient: PalClient;

  constructor(palClient: PalClient) {
    this._palClient = palClient;
  }

  async getPeerByIlpAddress(ilpAddress: string): Promise<IPeer | null> {
    const peer = await this._palClient.getPeerByIlpAddress(ilpAddress);
    if (!peer) return null;

    return {
      peerId: peer.id,
      assetCode: peer.assetCode,
      assetScale: peer.assetScale
    };
  }
}

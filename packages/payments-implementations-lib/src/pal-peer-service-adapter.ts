import { IPeerService } from 'payments-domain-lib';
import { PalClient } from 'pal-client-lib';

export class PalPeerServiceAdapter implements IPeerService {
  private _palClient: PalClient;

  constructor(palClient: PalClient) {
    this._palClient = palClient;
  }

  // TODO: implement using palClient once PAL exposes resolvePeerByIlpAddress
  async resolvePeerByIlpAddress(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _destinationIlpAddress: string
  ): Promise<{ peerId: string }> {
    return { peerId: '' };
  }
}

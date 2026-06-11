import { IPeerService } from '../../src/payment-intent/interfaces';

export class MockPeerService implements IPeerService {
  async getPeerByIlpAddress(
    _ilpAddress: string
  ): Promise<{ peerId: string; assetCode: string; assetScale: number } | null> {
    return { peerId: 'peer-1', assetCode: 'USD', assetScale: 2 };
  }
}

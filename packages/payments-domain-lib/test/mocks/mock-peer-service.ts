import { IPeer, IPeerService } from '../../src/payment-intent/interfaces';

export class MockPeerService implements IPeerService {
  async getPeerByIlpAddress(_ilpAddress: string): Promise<IPeer | null> {
    return { peerId: 'peer-1', assetCode: 'USD', assetScale: 2 };
  }
}

import { randomBytes } from 'crypto';

// TODO: extract to an ilp-client-lib once ILP owns credential
// and model more closely after @interledger/stream-receiver's StreamServer.generateCredentials

export interface IIlpClient {
  generateStreamCredentials(): Promise<string>;
}

export class StubIlpClient implements IIlpClient {
  async generateStreamCredentials(): Promise<string> {
    return randomBytes(32).toString('base64');
  }
}

'use strict';

import { PaymentsServiceServer } from './grpc/grpc-service';

export class PaymentsApiService {
  private static grpcService: PaymentsServiceServer;

  static async start(): Promise<void> {
    this.grpcService = new PaymentsServiceServer(
      '1',
      '0.0.0.0:50052'
    );

    await this.grpcService.start();
  }

  static async stop(): Promise<void> {
    await this.grpcService.stop();
  }
}

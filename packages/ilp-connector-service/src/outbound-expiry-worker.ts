import { ConsoleLogger, ILogger } from 'common-types-lib';
import { IlpConnector } from './connector';

const DEFAULT_POLL_INTERVAL_MS = 250;

export class OutboundExpiryWorker {
  private _timer?: NodeJS.Timeout;

  constructor(
    private readonly _connector: IlpConnector,
    private readonly _pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS,
    private readonly _logger: ILogger = new ConsoleLogger()
  ) {}

  start(): void {
    this._timer = setInterval(() => {
      void this._poll();
    }, this._pollIntervalMs);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private async _poll(): Promise<void> {
    try {
      await this._connector.processExpiredOutboundPackets();
    } catch (err) {
      this._logger.warn(
        `Outbound expiry worker poll failed: ${(err as Error).message}`
      );
    }
  }
}

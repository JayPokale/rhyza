import { KafkaJS } from '@confluentinc/kafka-javascript';
import { ILogger } from 'common-types-lib';

export class KafkaLoggerWrapper implements KafkaJS.Logger {
  private readonly _logger: ILogger;
  constructor(logger: ILogger) {
    this._logger = logger;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info(message: string, ...optionalParams: any[]): void {
    this._logger.info(message, ...optionalParams);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug(message: string, ...optionalParams: any[]): void {
    this._logger.debug(message, ...optionalParams);
  }

  error(message: string, extra: object | undefined): void {
    this._logger.error(message, extra);
  }

  warn(message: string, extra: object | undefined): void {
    this._logger.warn(message, extra);
  }

  namespace(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    namespace: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    logLevel: KafkaJS.logLevel | undefined
  ): KafkaJS.Logger {
    return this;
  }

  setLogLevel(logLevel: KafkaJS.logLevel): void {
    this._logger.setLogLevel(logLevel * 10);
  }
}

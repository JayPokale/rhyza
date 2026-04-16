import {KafkaJS} from "@confluentinc/kafka-javascript";
import {ILogger} from "common-types-lib";

export class KafkaLoggerWrapper implements KafkaJS.Logger {
  private readonly _logger: ILogger;
  constructor(logger: ILogger) {
    this._logger = logger;
  }
  info(message: string, ...optionalParams: any[]): void {
    this._logger.info(message, ...optionalParams);
  }
  debug(message: string, ...optionalParams: any[]): void {
    this._logger.debug(message, ...optionalParams);
  }

  error(message: string, extra: object | undefined): void {
    this._logger.error(message, extra);
  }

  warn(message: string, extra: object | undefined): void {
    this._logger.warn(message, extra);
  }

  namespace(namespace: string, logLevel: KafkaJS.logLevel | undefined): KafkaJS.Logger {
    return this;
  }

  setLogLevel(logLevel: KafkaJS.logLevel): void {
    this._logger.setLogLevel(logLevel * 10);
  }

}

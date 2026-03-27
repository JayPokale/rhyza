import pino from 'pino';
import {ILogger} from "common-types-lib";

export class PinoLogger implements ILogger {
  private _logger: pino.Logger<never, boolean>;

  constructor() {
    this._logger = pino({
      level: process.env["LOG_LEVEL"] || "debug",
      base: null,
    });
  }

  fatal(...args:any[]): void {
    this._logger.fatal(args);
  }
  error(...args:any[]): void {
    this._logger.error(args);
  }
  warn(...args:any[]): void {
    this._logger.warn(args);
  }
  info(...args:any[]): void {
    this._logger.info(args);
  }
  debug(...args:any[]): void {
    this._logger.debug(args);
  }
  trace(...args:any[]): void {
    this._logger.trace(args);
  }

  isTraceEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.trace;
  }
  isDebugEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.debug;
  }
  isInfoEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.info;
  }
  isWarnEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.warn;
  }
  isErrorEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.error;
  }
  isFatalEnabled(): boolean {
    return this._logger.levelVal >= pino.levels.values.fatal;
  }


}

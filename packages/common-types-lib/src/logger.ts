/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ILoggerParams {
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
}

export interface ILogger {
  fatal: ILoggerParams;
  error: ILoggerParams;
  warn: ILoggerParams;
  info: ILoggerParams;
  debug: ILoggerParams;
  trace: ILoggerParams;
}

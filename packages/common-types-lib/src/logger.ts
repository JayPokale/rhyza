/* eslint-disable @typescript-eslint/no-explicit-any */

export interface LoggerParams {
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
}

export interface Logger {
  fatal: LoggerParams;
  error: LoggerParams;
  warn: LoggerParams;
  info: LoggerParams;
  debug: LoggerParams;
  trace: LoggerParams;
}

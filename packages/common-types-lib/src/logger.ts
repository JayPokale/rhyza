export type LoggerParams = {
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
};

export interface Logger {
  fatal: LoggerParams;
  error: LoggerParams;
  warn: LoggerParams;
  info: LoggerParams;
  debug: LoggerParams;
  trace: LoggerParams;
}

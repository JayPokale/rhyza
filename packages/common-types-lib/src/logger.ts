"use strict";


export type LoggerParams = {
    (obj: unknown, msg?: string, ...args: any[]): void;
    (msg: string, ...args: any[]): void;
}

export interface ILogger {
    fatal: LoggerParams;
    error: LoggerParams;
    warn: LoggerParams;
    info: LoggerParams;
    debug: LoggerParams;
    trace: LoggerParams;
}
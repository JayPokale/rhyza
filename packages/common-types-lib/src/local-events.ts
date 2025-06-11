/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


export type LocalEvent = {
    type: string;
    data: Record<string, unknown>;
}

export interface ILocalEventConsumerAdapter {
    connect(...args: any[]): Promise<void>;

    registerConsumer(
        type: string,
        consumer: (...args: any[]) => Promise<void>
    ): Promise<void>;
}

export interface ILocalEventProducerAdapter {
    connect(...args: any[]): Promise<void>;

    publish(events: LocalEvent[]): Promise<void>;
}

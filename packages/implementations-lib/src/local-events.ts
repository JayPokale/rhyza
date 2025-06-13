"use strict";

import EventEmitter from "events";
import {ILocalEventConsumerAdapter, ILocalEventProducerAdapter, LocalEvent} from "common-types-lib";


export class LocalEventEmitterPubSub implements ILocalEventProducerAdapter, ILocalEventConsumerAdapter {
    private eventEmitter = new EventEmitter();

    public async connect(...args: any[]): Promise<void> {
    }

    public async publish(events: LocalEvent[]): Promise<void> {
        // setImmediate to defer the consumption and avoid this to be sync
        setImmediate(()=>{
            for (const event of events) {
                this.eventEmitter.emit(event.type, event);
            }
        });
    }

    public async registerConsumer(
        type: string,
        consumer: (...args: any[]) => Promise<void>
    ): Promise<void> {
        this.eventEmitter.addListener(type, async (event) => consumer(event));
    }
}

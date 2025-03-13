import EventEmitter from "events";
import logger from "./logger";

export interface Event {
  type: string;
  data: Record<string, unknown>;
}

export interface EventConsumerAdapter {
  connect(...args: any[]): Promise<void>;
  registerConsumer(
    type: string,
    consumer: (...args: any[]) => Promise<void>
  ): Promise<void>;
}

export interface EventProducerAdapter {
  connect(...args: any[]): Promise<void>;
  publish(events: Event[]): Promise<void>;
}

export class EventEmitterPubSub
  implements EventProducerAdapter, EventConsumerAdapter
{
  private eventEmitter = new EventEmitter();

  public async connect(...args: any[]): Promise<void> {}

  public async publish(events: Event[]): Promise<void> {
    for (const event of events) {
      logger.debug({ ...event }, event.type);
      this.eventEmitter.emit(event.type, event);
    }
  }

  public async registerConsumer(
    type: string,
    consumer: (...args: any[]) => Promise<void>
  ): Promise<void> {
    this.eventEmitter.addListener(type, async (event) => consumer(event));
  }
}

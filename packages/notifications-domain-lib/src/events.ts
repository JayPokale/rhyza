import { DomainEventMsg, EventTopics } from 'common-types-lib';

const BOUNDED_CONTEXT_NAME = 'notification';
const AGGREGATE_NAME = 'notifications';

export interface NotificationCreatedEventPayload {
  id: string;
  data: Record<string, unknown>;
}

export class NotificationCreatedEvent extends DomainEventMsg {
  msgKey: string;
  msgTopic: string = EventTopics.NotificationEvents;
  aggregateId: string;
  contextName: string = BOUNDED_CONTEXT_NAME;
  aggregateName: string = AGGREGATE_NAME;
  payload: NotificationCreatedEventPayload;

  constructor(payload: NotificationCreatedEventPayload, requestId?: string) {
    super();
    this.aggregateId = this.msgKey = payload.id;
    this.payload = payload;
  }
}

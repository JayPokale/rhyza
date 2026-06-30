// message published by the peer aggregate when a fx rate is expired
import { PeerDomainEvent } from './peers';

export class FxRateCacheExpiredEvent extends PeerDomainEvent {
  payload: FxRateCacheExpiredEventPayload;

  constructor(payload: FxRateCacheExpiredEventPayload) {
    super(payload.id);
    this.msgKey = payload.id;
    this.payload = payload;
  }
}
export type FxRateCacheExpiredEventPayload = {
  id: string;
};

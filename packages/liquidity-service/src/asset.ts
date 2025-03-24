import { Event } from "./event";

export enum AssetEvent {
  ASSET_CREATED = "ASSET_CREATED",
}

export interface AssetCreatedEvent extends Event {
  type: AssetEvent.ASSET_CREATED;
  data: {
    asset: {
      id: string;
      code: string;
      scale: number;
    };
  };
}

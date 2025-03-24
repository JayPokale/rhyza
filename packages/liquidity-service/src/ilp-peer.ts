import { Event } from "./event";

export enum IlpPeerEvent {
  ILP_PEER_CREATED = "ILP_PEER_CREATED",
}

export interface IlpPeerCreatedEvent extends Event {
  type: IlpPeerEvent.ILP_PEER_CREATED;
  data: {
    peer: {
      id: string;
      assetCode: string;
      assetScale: number;
    };
  };
}

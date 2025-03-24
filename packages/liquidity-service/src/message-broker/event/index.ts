import { DomainEventMsg } from "../message";

/**
 * Enumeration representing various topics used in the system.
 *
 * This enum provides a set of predefined constants that represent specific
 * topics utilized for communication, event handling, or other system-level
 * categorization.
 *
 * Enum Members:
 * - ApiResponseEvents: Represents topics related to API response events.
 */
export enum Topic {
  AssetCreatedEvent = "asset-created-event",
  WalletAddressCreatedEvent = "wallet-address-created-event",
  IlpPeerCreatedEvent = "ilp-peer-created-event",
}

export interface AssetCreatedEventPayload {
  asset: {
    id: string;
    code: string;
    scale: number;
  };
}

export class AssetCreatedEvent extends DomainEventMsg {
  contextName: string = "asset-created-event";
  aggregateId: string;
  aggregateName: string = "asset-created-event";
  msgKey: string;
  msgTopic: string = Topic.AssetCreatedEvent;
  payload: AssetCreatedEventPayload;

  constructor(payload: AssetCreatedEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface WalletAddressCreatedEventPayload {
  walletAddress: {
    id: string;
    assetCode: string;
    assetScale: number;
  };
}

export class WalletAddressCreatedEvent extends DomainEventMsg {
  contextName: string = "wallet-address-created-event";
  aggregateId: string;
  aggregateName: string = "wallet-address-created-event";
  msgKey: string;
  msgTopic: string = Topic.WalletAddressCreatedEvent;
  payload: WalletAddressCreatedEventPayload;

  constructor(payload: WalletAddressCreatedEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface IlpPeerCreatedEventPayload {
  peer: {
    id: string;
    assetCode: string;
    assetScale: number;
  };
}

export class IlpPeerCreatedEvent extends DomainEventMsg {
  contextName: string = "ilp-peer-created-event";
  aggregateId: string;
  aggregateName: string = "ilp-peer-created-event";
  msgKey: string;
  msgTopic: string = Topic.IlpPeerCreatedEvent;
  payload: IlpPeerCreatedEventPayload;

  constructor(payload: IlpPeerCreatedEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

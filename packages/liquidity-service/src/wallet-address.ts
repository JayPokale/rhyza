import { Event } from "./event";

export enum WalletAddressEvent {
  WALLET_ADDRESS_CREATED = "WALLET_ADDRESS_CREATED",
}

export interface WalletAddressCreatedEvent extends Event {
  type: WalletAddressEvent.WALLET_ADDRESS_CREATED;
  data: {
    id: string;
    assetCode: string;
    assetScale: number;
    // isActive: boolean; // Do we need to propagate this to the liquidity service
  };
}

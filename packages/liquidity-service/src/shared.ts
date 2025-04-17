export interface Asset {
  id: string;
  scale: number;
  code: string;
}

export interface Amount {
  assetCode: string;
  assetScale: number;
  value: bigint;
}

export interface IlpPeer {
  id: string;
  assetScale: number;
  assetCode: string;
}

export interface WalletAddress {
  id: string;
  assetScale: number;
  assetCode: string;
}

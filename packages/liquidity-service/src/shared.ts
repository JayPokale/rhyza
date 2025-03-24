export interface Asset {
  scale: number;
  code: string;
}

export interface Amount {
  assetCode: string;
  assetScale: number;
  value: bigint;
}

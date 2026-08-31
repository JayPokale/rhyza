export interface IClientErrorResponse {
  error: {
    code: string;
    description: string;
  };
}

export interface IAmount {
  value: bigint;
  assetCode: string;
  assetScale: number;
}

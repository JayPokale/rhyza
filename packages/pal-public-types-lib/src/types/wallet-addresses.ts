export interface IPalWalletAddressDto {
  id: string;
  publicName: string;
  assetCode: string;
  assetScale: number;
  isActive: boolean;

  aliases: IPalWalletAddressAliasDto[];
  keys?: IPalWalletAddressKeyDto[];
}

export interface IPalWalletAddressAliasDto {
  domain: string | null;
  pathName: string;
  walletId: string;
}

export interface IPalJsonWebKeyDto {
  kid: string;
  alg: string;
  kty: string;
  crv: string;
  x: string;
  use?: string;
}

export interface IPalWalletAddressKeyDto {
  id: string;
  walletAddressId: string;
  jwk: IPalJsonWebKeyDto;
  revoked: boolean;
  revokedAt?: Date;
}

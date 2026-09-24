import {
  IPalWalletAddressDto,
  IPalWalletAddressKeyDto
} from 'pal-public-types-lib';

export interface IPalWalletAddressRepository {
  store(walletAddress: IPalWalletAddressDto): Promise<void>;
  fetch(ids: string[]): Promise<IPalWalletAddressDto[]>;

  getByAlias(
    domain: string | null,
    pathName: string
  ): Promise<IPalWalletAddressDto | null>;

  storeKey(key: IPalWalletAddressKeyDto): Promise<void>;
}

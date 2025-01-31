import { Repository } from "./repository";

export class DuplicateWalletAddressFoundError extends Error {}
// export class InvalidWalletAddressURLError extends Error {}

export interface WalletAddress {
  id: string;
  url: string;
  isActive: boolean;
  assetCode: string;
  assetScale: number;
}

interface CreateWalletAddressArgs {
  id?: string;
  url: string;
  assetCode: string;
  assetScale: number;
}

export interface WalletAddressServiceAdapter {
  getById(id: string): Promise<WalletAddress | undefined>;
  createWalletAddress(args: CreateWalletAddressArgs): Promise<string>;
}

export class WalletAddressService implements WalletAddressServiceAdapter {
  constructor(private walletAddressRepository: Repository<WalletAddress>) {}

  public async createWalletAddress(
    args: CreateWalletAddressArgs
  ): Promise<string> {
    let id: string;

    if (args.id) {
      const existingIncomingPayment =
        await this.walletAddressRepository.fetchById(args.id);

      if (existingIncomingPayment) {
        throw new DuplicateWalletAddressFoundError();
      }
      id = args.id;
    } else {
      id = crypto.randomUUID();
    }

    // TODO: throw this error?
    // if (args.url.length === 0) {
    //   throw new InvalidWalletAddressURLError();
    // }

    const walletAddress: WalletAddress = {
      ...args,
      isActive: true,
      id,
    };

    await this.walletAddressRepository.store(walletAddress);

    return id;
  }

  public getById(id: string): Promise<WalletAddress | undefined> {
    return this.walletAddressRepository.fetchById(id);
  }
}

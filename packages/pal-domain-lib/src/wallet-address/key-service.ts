import { ILogger } from 'common-types-lib';
import {
  IPalJsonWebKeyDto,
  IPalWalletAddressKeyDto
} from 'pal-public-types-lib';
import {
  DuplicateWalletAddressKeyError,
  WalletAddressNotFoundError
} from './errors';
import { PalWalletAddressKey } from './entities/wallet-address-key';
import {
  IPalWalletAddressKeyRepository,
  IPalWalletAddressRepository
} from './interfaces';

export class WalletAddressKeyService {
  private readonly _logger: ILogger;
  private readonly _keyRepo: IPalWalletAddressKeyRepository;
  private readonly _walletRepo: IPalWalletAddressRepository;

  constructor(
    keyRepo: IPalWalletAddressKeyRepository,
    walletRepo: IPalWalletAddressRepository,
    logger: ILogger
  ) {
    this._keyRepo = keyRepo;
    this._walletRepo = walletRepo;
    this._logger = logger;
  }

  async addKey(
    walletAddressId: string,
    jwk: IPalJsonWebKeyDto
  ): Promise<string> {
    const key = PalWalletAddressKey.create(walletAddressId, jwk);

    const [wallet] = await this._walletRepo.fetch([walletAddressId]);
    if (!wallet) {
      throw new WalletAddressNotFoundError(
        `Wallet Address with id ${walletAddressId} does not exist`
      );
    }

    const existing =
      await this._keyRepo.fetchByWalletAddressId(walletAddressId);
    if (existing.some((stored) => stored.jwk.kid === jwk.kid)) {
      throw new DuplicateWalletAddressKeyError(
        `Wallet address key with kid ${jwk.kid} already exists`
      );
    }

    await this._keyRepo.store(key.toObject());
    this._logger.info(
      `Stored wallet address key ${key.id} for wallet ${walletAddressId}`
    );
    return key.id;
  }

  async getKeys(walletAddressId: string): Promise<IPalWalletAddressKeyDto[]> {
    return this._keyRepo.fetchByWalletAddressId(walletAddressId);
  }
}

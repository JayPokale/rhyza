import { ILogger } from 'common-types-lib';
import {
  IPalFspFxService,
  IPalFxCacheExpiryService,
  IPalFxRepository
} from './interfaces';
import { FxRate } from './entity';

export class FxAggregate {
  private _logger: ILogger;
  private _ratesRepo: IPalFxRepository;
  private readonly _fspService: IPalFspFxService;
  private readonly _fxCacheExpiryService: IPalFxCacheExpiryService;

  constructor(
    ratesRepo: IPalFxRepository,
    fspService: IPalFspFxService,
    fxCacheExpiryService: IPalFxCacheExpiryService,
    logger: ILogger
  ) {
    this._ratesRepo = ratesRepo;
    this._fspService = fspService;
    this._fxCacheExpiryService = fxCacheExpiryService;
    this._logger = logger.child(this.constructor.name);
  }

  private async _fetchIntraFspRateAndStoreIt(
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<number | null> {
    let fspRate;
    try {
      fspRate = await this._fspService.getIntraFspFxRate(
        sourceAssetCode,
        destinationAssetCode
      );
    } catch (e) {
      this._logger.error(
        e,
        `Failed to get Intra FSP FX rate for ${sourceAssetCode}/${destinationAssetCode} asset pair`
      );
      return null;
    }

    if (!fspRate) {
      return null;
    }

    const newRate = new FxRate(
      sourceAssetCode,
      destinationAssetCode,
      'IntraFspRate',
      'PulledFromFsp',
      null,
      fspRate.rate,
      Date.now(),
      fspRate.expiresAt
    );
    await this._ratesRepo.store(newRate.toDto());

    // set expiration timer
    await this._fxCacheExpiryService.setExpiry(newRate.id, fspRate.expiresAt);

    return fspRate.rate;
  }

  private async _fetchPeerRateAndStoreIt(
    peerId: string,
    sourceAssetCode: string,
    destinationAssetCode: string
  ): Promise<number | null> {
    let fspRate;
    try {
      fspRate = await this._fspService.getPeerFxFromFsp(
        sourceAssetCode,
        destinationAssetCode,
        peerId
      );
    } catch (e) {
      this._logger.error(
        e,
        `Failed to get Peer FSP FX rate for peerId: ${peerId} and ${sourceAssetCode}/${destinationAssetCode} asset pair`
      );
      return null;
    }

    if (!fspRate) {
      return null;
    }

    const newRate = new FxRate(
      sourceAssetCode,
      destinationAssetCode,
      'PeerRate',
      'PulledFromFsp',
      peerId,
      fspRate.rate,
      Date.now(),
      fspRate.expiresAt
    );
    await this._ratesRepo.store(newRate.toDto());

    // set expiration timer
    await this._fxCacheExpiryService.setExpiry(newRate.id, fspRate.expiresAt);

    return fspRate.rate;
  }

  async getIntraFspFxRate(
    sourceAssetCode: string,
    destinationAsset: string
  ): Promise<number | null> {
    const rateId = FxRate.getRateId(
      sourceAssetCode,
      destinationAsset,
      'IntraFspRate',
      null
    );
    const existingRateDto = await this._ratesRepo.fetch([rateId]);
    const existingRate = existingRateDto[0]
      ? FxRate.fromDto(existingRateDto[0])
      : null;

    if (existingRate && !existingRate.isExpired()) {
      return existingRate.rate;
    }

    return await this._fetchIntraFspRateAndStoreIt(
      sourceAssetCode,
      destinationAsset
    );
  }

  async setIntraFspFxRate(
    sourceAssetCode: string,
    destinationAsset: string,
    rate: number,
    expiresAt: number | null
  ): Promise<void> {
    const newRate = new FxRate(
      sourceAssetCode,
      destinationAsset,
      'IntraFspRate',
      'PushedByFsp',
      null,
      rate,
      Date.now(),
      expiresAt
    );
    await this._ratesRepo.store(newRate.toDto());
    await this._fxCacheExpiryService.clearExpiry(newRate.id);
  }

  async getPeerFxRate(
    peerId: string,
    sourceAssetCode: string,
    destinationAsset: string
  ): Promise<number | null> {
    const rateId = FxRate.getRateId(
      sourceAssetCode,
      destinationAsset,
      'PeerRate',
      peerId
    );
    const existingRateDto = await this._ratesRepo.fetch([rateId]);
    const existingRate = existingRateDto[0]
      ? FxRate.fromDto(existingRateDto[0])
      : null;

    if (existingRate && !existingRate.isExpired()) {
      return existingRate.rate;
    }

    return await this._fetchPeerRateAndStoreIt(
      peerId,
      sourceAssetCode,
      destinationAsset
    );
  }

  async setPeerFxRate(
    sourceAssetCode: string,
    destinationAsset: string,
    peerId: string,
    rate: number,
    expiresAt: number | null
  ): Promise<void> {
    const newRate = new FxRate(
      sourceAssetCode,
      destinationAsset,
      'PeerRate',
      'PushedByFsp',
      peerId,
      rate,
      Date.now(),
      expiresAt
    );
    await this._ratesRepo.store(newRate.toDto());
    await this._fxCacheExpiryService.clearExpiry(newRate.id);
  }

  async notifyExpiredFxRate(
    rateId: string,
    notificationTime: number
  ): Promise<void> {
    const existingRateDto = await this._ratesRepo.fetch([rateId]);
    const existingRate = existingRateDto[0]
      ? FxRate.fromDto(existingRateDto[0])
      : null;

    if (
      !existingRate ||
      existingRate.acquisitionMethod === 'PushedByFsp' ||
      !existingRate.fetchedAt ||
      existingRate.fetchedAt >= notificationTime
    ) {
      // rate doesn't exist, was set by FSP, or was pre-fetched recently
      return;
    }

    if (existingRate.rateType === 'PeerRate') {
      // peer must exist on peer rate type
      await this._fetchPeerRateAndStoreIt(
        existingRate.peerId!,
        existingRate.sourceAssetCode,
        existingRate.destinationAssetCode
      );
    } else {
      await this._fetchIntraFspRateAndStoreIt(
        existingRate.sourceAssetCode,
        existingRate.destinationAssetCode
      );
    }
  }
}

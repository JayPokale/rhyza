"use strict";


import {DuplicateAssetFoundError, IAssetRepository, IAssetService} from "./asset-types";
import {ILiquidityService} from "../liquidity";

export class AssetService implements IAssetService {
    constructor(
        private _assetRepository: IAssetRepository,
        private liquidityService: ILiquidityService
    ) {
    }

    public async createAsset(scale: number, code: string): Promise<string> {
        const existingAsset = await this._assetRepository.existsByCode(code);

        if (existingAsset) {
            throw new DuplicateAssetFoundError();
        }

        const id = crypto.randomUUID();

        await this._assetRepository.store(id, scale, code);

        // CANNOT BE HERE - must be called by the higher level domain code
        await this.liquidityService.createAssetAccount({
            id,
            scale: scale,
            code: code,
        });

        return id;
    }
}

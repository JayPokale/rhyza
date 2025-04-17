import { LiquidityServiceAdapter } from "./liquidity";
import { AssetRepository } from "./repository";

export class DuplicateAssetFoundError extends Error {}

interface CreateAssetArgs {
  scale: number;
  code: string;
}

export interface AssetServiceAdapter {
  createAsset(args: CreateAssetArgs): Promise<string>;
}

export class AssetService implements AssetServiceAdapter {
  constructor(
    private assetRepository: AssetRepository,
    private liquidityService: LiquidityServiceAdapter
  ) {}

  public async createAsset(args: CreateAssetArgs): Promise<string> {
    const existingAsset = await this.assetRepository.existsByCode(args.code);

    if (existingAsset) {
      throw new DuplicateAssetFoundError();
    }

    const id = crypto.randomUUID();

    await this.assetRepository.store({
      id,
      scale: args.scale,
      code: args.code,
    });

    await this.liquidityService.createAssetAccount({
      id,
      scale: args.scale,
      code: args.code,
    });

    return id;
  }
}

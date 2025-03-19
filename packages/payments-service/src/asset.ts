import { Pool } from "pg";
import logger from "./logger";
import { EventProducerAdapter } from "./event";
import { Event } from "./event";

export class DuplicateAssetFoundError extends Error {}

interface Asset {
  id: string;
  code: string;
  scale: number; // this is just a display scale (for viewing)
}

interface CreateAssetArgs {
  scale: number;
  code: string;
}

interface AssetRepository {
  existsByCode(code: string): Promise<boolean>;
  store(asset: Asset): Promise<void>;
}

export enum AssetEvent {
  ASSET_CREATED = "ASSET_CREATED",
}

export interface AssetCreatedEvent extends Event {
  type: AssetEvent.ASSET_CREATED;
  data: {
    asset: {
      id: string;
      code: string;
      scale: number;
    };
  };
}

export interface AssetServiceAdapter {
  createAsset(args: CreateAssetArgs): Promise<string>;
}

export class AssetPsqlRepository implements AssetRepository {
  TABLE_NAME = "assets";
  constructor(private pool: Pool) {}

  public async existsByCode(code: string): Promise<boolean> {
    try {
      const res = await this.pool.query(
        `SELECT EXISTS(SELECT 1 FROM ${this.TABLE_NAME} WHERE code = $1)`,
        [code]
      );
      return res.rows[0].exists;
    } catch (error) {
      logger.error({ error }, "Error checking if asset exists");
      throw error;
    }
  }

  public async store(asset: Asset): Promise<void> {
    try {
      const query = `
          INSERT INTO ${this.TABLE_NAME} (id, code, scale)
          VALUES ($1, $2, $3)
        `;

      const values = [asset.id, asset.code, asset.scale];

      await this.pool.query(query, values);
    } catch (error) {
      logger.error({ error }, "Error storing asset");
      throw error;
    }
  }
}

export class AssetService implements AssetServiceAdapter {
  constructor(
    private assetRepository: AssetRepository,
    private eventProducer: EventProducerAdapter
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

    const assetCreatedEvent: AssetCreatedEvent = {
      type: AssetEvent.ASSET_CREATED,
      data: {
        asset: {
          id,
          scale: args.scale,
          code: args.code,
        },
      },
    };

    await this.eventProducer.publish([assetCreatedEvent]);

    return id;
  }
}

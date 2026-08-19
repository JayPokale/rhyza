import {
  IGrant,
  IGrantRepository,
  IRotatedGrantUpdate
} from '../../src/grant/interfaces';

export class MockGrantRepo implements IGrantRepository {
  private _store: Map<string, IGrant> = new Map();

  async storeMany(grants: IGrant[]): Promise<void> {
    for (const grant of grants) {
      this._store.set(grant.id, grant);
    }
  }

  async storeRotatedGrants(_updates: IRotatedGrantUpdate[]): Promise<void> {
    // No-op in tests: rotation state is already reflected on the in-memory grant.
  }

  async fetchById(id: string): Promise<IGrant | undefined> {
    return this._store.get(id);
  }

  async fetchByIds(ids: string[]): Promise<IGrant[]> {
    return ids.flatMap((id) => {
      const grant = this._store.get(id);
      return grant ? [grant] : [];
    });
  }

  getAll(): IGrant[] {
    return [...this._store.values()];
  }
}

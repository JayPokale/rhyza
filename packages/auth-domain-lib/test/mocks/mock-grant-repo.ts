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

  async storeRotatedGrants(updates: IRotatedGrantUpdate[]): Promise<void> {
    for (const update of updates) {
      const grant = this._store.get(update.id);
      if (!grant) continue;
      const tokens = grant.accessTokens.map((t) =>
        t.value === update.revokedToken.value ? update.revokedToken : t
      );
      tokens.push(update.newToken);
      this._store.set(update.id, { ...grant, accessTokens: tokens });
    }
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

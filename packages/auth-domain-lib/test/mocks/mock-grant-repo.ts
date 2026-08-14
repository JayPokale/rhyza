import {
  IContinuedGrantUpdate,
  IGrant,
  IGrantRepository
} from '../../src/grant/interfaces';

export class MockGrantRepo implements IGrantRepository {
  private _store: Map<string, IGrant> = new Map();

  async storeMany(grants: IGrant[]): Promise<void> {
    for (const grant of grants) {
      this._store.set(grant.id, grant);
    }
  }

  async storeContinuedGrants(grants: IContinuedGrantUpdate[]): Promise<void> {
    for (const update of grants) {
      const existing = this._store.get(update.id);
      if (!existing) continue;

      const accessTokens = [...existing.accessTokens];
      if (update.accessToken) {
        accessTokens.push(update.accessToken);
      }

      this._store.set(update.id, {
        ...existing,
        state: update.state,
        continueToken: update.continueToken,
        continueId: update.continueId,
        lastContinuedAt: update.lastContinuedAt,
        accessTokens
      });
    }
  }
  
  async storeInteractions(interactionUpdates: { interactRefs: string[]; grant: IGrant }[]): Promise<void> {
    for (const update of interactionUpdates) {
      this._store.set(update.grant.id, update.grant)
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

interface BaseEntity {
  id: string;
}

export interface Repository<T extends BaseEntity> {
  store(entity: T): Promise<void>;
  fetchById(id: string): Promise<T | undefined>;
}

export class InMemoryRepository<T extends BaseEntity> implements Repository<T> {
  map: Map<string, T> = new Map();

  public async store(entity: T): Promise<void> {
    this.map.set(entity.id, entity);
  }

  public async fetchById(id: string): Promise<T | undefined> {
    return this.map.get(id);
  }
}

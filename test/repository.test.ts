import test, { describe } from "node:test";
import assert from "node:assert";
import { InMemoryRepository } from "../src/repository";

describe("InMemoryRepository", () => {
  test("store and fetchById", async () => {
    const repository = new InMemoryRepository<any>();

    const entity = {
      id: "test-entity-id",
    };

    await repository.store(entity);

    const fetchedEntity = await repository.fetchById(entity.id);
    assert.strictEqual(fetchedEntity, entity);
  });
});

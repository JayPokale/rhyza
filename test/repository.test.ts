import test, { beforeEach, describe } from "node:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { WalletAddress } from "../src/wallet-address";
import {
  WalletAddressRepository,
  WalletAddressPsqlRepository,
  WalletAddressInMemoryRepository,
} from "../src/repository";

describe("Repository", () => {
  describe("WalletAddressCachedRepository", async (t) => {
    let localCacheRepo: WalletAddressInMemoryRepository;
    let persistenceRepo: WalletAddressPsqlRepository;
    let repo: WalletAddressRepository;
    let walletAddress: WalletAddress;

    beforeEach(() => {
      // Use real local cache and mocked persistence repo
      localCacheRepo = new WalletAddressInMemoryRepository();
      persistenceRepo = {
        fetchById: async (id: string) => {
          if (id === walletAddress?.id) {
            return walletAddress;
          }
          return undefined;
        },
        exists: async (id: string) => {
          return id === walletAddress?.id;
        },
        store: async (wa: WalletAddress) => {
          walletAddress = wa;
        },
      } as WalletAddressPsqlRepository;
      repo = new WalletAddressRepository(localCacheRepo, persistenceRepo);
      walletAddress = {
        id: randomUUID(),
        url: "example.com",
        isActive: true,
        assetCode: "USD",
        assetScale: 2,
      };
    });

    describe("fetchById", async (t) => {
      test("should return wallet address from local cache if present", async (t) => {
        await localCacheRepo.store(walletAddress);

        const cacheSpy = t.mock.method(localCacheRepo, "fetchById");
        const dbSpy = t.mock.method(persistenceRepo, "fetchById");
        const result = await repo.fetchById(walletAddress.id);

        assert.deepStrictEqual(result, walletAddress);
        assert.deepStrictEqual(
          await cacheSpy.mock.calls[0].result,
          walletAddress
        );
        assert.strictEqual(dbSpy.mock.calls.length, 0);
      });

      test("should return wallet address from persistence repository if not in cache", async (t) => {
        const cacheSpy = t.mock.method(localCacheRepo, "fetchById");
        const dbSpy = t.mock.method(persistenceRepo, "fetchById");
        const result = await repo.fetchById(walletAddress.id);

        assert.deepStrictEqual(result, walletAddress);
        assert.strictEqual(await cacheSpy.mock.calls[0].result, undefined);
        assert.strictEqual(dbSpy.mock.calls.length, 1);
      });

      test("should store fetched wallet address in local cache", async (t) => {
        const cacheSpy = t.mock.method(localCacheRepo, "store");
        await repo.fetchById(walletAddress.id);
        assert.deepStrictEqual(cacheSpy.mock.calls[0].arguments, [
          walletAddress,
        ]);
        const cached = await localCacheRepo.fetchById(walletAddress.id);
        assert.deepStrictEqual(cached, walletAddress);
      });

      test("should return undefined if wallet address is not found in either cache or persistence", async (t) => {
        const result = await repo.fetchById(randomUUID());
        assert.strictEqual(result, undefined);
      });
    });

    describe("exists", async (t) => {
      test("should return true if wallet address exists in local cache", async (t) => {
        await localCacheRepo.store(walletAddress);
        const cacheSpy = t.mock.method(localCacheRepo, "exists");
        const dbSpy = t.mock.method(persistenceRepo, "exists");

        const result = await repo.exists(walletAddress.id);

        assert.strictEqual(result, true);
        assert.strictEqual(await cacheSpy.mock.calls[0].result, true);
        assert.strictEqual(dbSpy.mock.calls.length, 0);
      });

      test("should return true if wallet address exists in persistence repository", async (t) => {
        const cacheSpy = t.mock.method(localCacheRepo, "exists");
        const dbSpy = t.mock.method(persistenceRepo, "exists");
        const result = await repo.exists(walletAddress.id);

        assert.strictEqual(result, true);
        assert.strictEqual(await cacheSpy.mock.calls[0].result, false);
        assert.strictEqual(await dbSpy.mock.calls[0].result, true);
      });

      test("should return false if wallet address does not exist in either cache or persistence", async (t) => {
        const cacheSpy = t.mock.method(localCacheRepo, "exists");
        const dbSpy = t.mock.method(persistenceRepo, "exists");
        const result = await repo.exists(randomUUID());

        assert.strictEqual(result, false);
        assert.strictEqual(await cacheSpy.mock.calls[0].result, false);
        assert.strictEqual(await dbSpy.mock.calls[0].result, false);
      });
    });

    describe("store", async (t) => {
      test("should store wallet address in both persistence and local cache", async (t) => {
        const cacheSpy = t.mock.method(localCacheRepo, "store");
        const dbSpy = t.mock.method(persistenceRepo, "store");
        const newWalletAddress: WalletAddress = {
          id: randomUUID(),
          url: "example.com",
          isActive: true,
          assetCode: "EUR",
          assetScale: 2,
        };
        await repo.store(newWalletAddress);
        const cached = await localCacheRepo.fetchById(newWalletAddress.id);
        const persisted = await persistenceRepo.fetchById(newWalletAddress.id);
        assert.deepStrictEqual(cached, newWalletAddress);
        assert.deepStrictEqual(persisted, newWalletAddress);
        assert.deepStrictEqual(
          cacheSpy.mock.calls[0].arguments[0],
          newWalletAddress
        );
        assert.deepStrictEqual(
          dbSpy.mock.calls[0].arguments[0],
          newWalletAddress
        );
      });
    });
  });
});

import test, { describe } from "node:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";

import {
  DuplicateWalletAddressFoundError,
  WalletAddress,
  WalletAddressService,
  WalletAddressInMemoryRepository,
} from "../src/wallet-address";

describe("WalletAddressService", () => {
  const walletAddressRepo = new WalletAddressInMemoryRepository();
  const walletAddressService = new WalletAddressService(walletAddressRepo);

  describe("getById", async (t) => {
    test("Returns undefined if the wallet address does not exist", async (t) => {
      const walletAddress = await walletAddressService.getById(randomUUID());
      assert.strictEqual(
        walletAddress,
        undefined,
        "Wallet address should not exist"
      );
    });

    test("returns the wallet address if it exists", async (t) => {
      const id = randomUUID();
      const walletAddress: WalletAddress = {
        id,
        url: "https://example.com",
        isActive: true,
        assetCode: "USD",
        assetScale: 2,
      };

      t.mock.method(walletAddressRepo, "fetchById", async () => walletAddress);

      const result = await walletAddressService.getById(id);
      assert.deepStrictEqual(result, walletAddress, "Wallet address mismatch");
    });
  });

  describe("createWalletAddress", async (t) => {
    test("creates and stores a new wallet address", async (t) => {
      const walletAddress: WalletAddress = {
        id: randomUUID(),
        url: "https://example.com",
        isActive: true,
        assetCode: "USD",
        assetScale: 2,
      };

      const storeSpy = t.mock.method(
        walletAddressRepo,
        "store",
        async () => undefined
      );

      await walletAddressService.createWalletAddress(walletAddress);

      assert.strictEqual(storeSpy.mock.calls.length, 1);
      assert.deepStrictEqual(
        storeSpy.mock.calls[0].arguments[0],
        walletAddress,
        "Wallet address stored incorrectly"
      );
    });

    test("generated id if not provided", async (t) => {
      const walletAddress = {
        url: "https://example.com",
        isActive: true,
        assetCode: "USD",
        assetScale: 2,
      };

      const storeSpy = t.mock.method(
        walletAddressRepo,
        "store",
        async () => undefined
      );

      await walletAddressService.createWalletAddress(walletAddress);

      assert.strictEqual(storeSpy.mock.calls.length, 1);

      const generatedId = storeSpy.mock.calls[0].arguments[0]?.id;
      assert(generatedId);
      assert(typeof generatedId === "string");
    });

    test("throws an error if the wallet address ID already exists", async (t) => {
      const id = randomUUID();
      const walletAddress: WalletAddress = {
        id,
        url: "https://example.com",
        isActive: true,
        assetCode: "USD",
        assetScale: 2,
      };

      t.mock.method(walletAddressRepo, "exists", async () => true);

      await assert.rejects(
        async () => {
          await walletAddressService.createWalletAddress(walletAddress);
        },
        DuplicateWalletAddressFoundError,
        "Does not throw expected error for duplicate wallet address"
      );
    });
  });
});

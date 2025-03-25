import test, { describe } from "node:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";

import {
  DuplicateIncomingPaymentFoundError,
  DuplicateQuoteFoundError,
  IncomingPayment,
  IncomingPaymentNotFoundError,
  IncomingPaymentWalletAddressAssetMismatchError,
  InvalidIncomingPaymentExpiryError,
  PaymentEventType,
  PaymentService,
  WalletAddressInactiveError,
  WalletAddressNotFoundError,
} from "../src/payment";
import { WalletAddress, WalletAddressService } from "../src/wallet-address";
import { EventEmitterPubSub } from "../src/event";
import { IlpPeerService } from "../src/ilp-peer";
import { RatesService } from "../src/rates";
import { LiquidityService } from "../src/liquidity";
import { RemoteIncomingPaymentService } from "../src/remote-incoming-payment";
import {
  WalletAddressInMemoryRepository,
  IlpPeerInMemoryRepository,
  IncomingPaymentInMemoryRepository,
  OutgoingPaymentInMemoryRepository,
  QuoteInMemoryRepository,
  RemoteIncomingPaymentInMemoryRepository,
} from "../src/repository";
import { ITelemetryService } from "telemetry";

describe("Payment Service", () => {
  const incomingPaymentRepo = new IncomingPaymentInMemoryRepository();
  const outgoingPaymentRepo = new OutgoingPaymentInMemoryRepository();
  const quoteRepo = new QuoteInMemoryRepository();
  const walletAddressRepo = new WalletAddressInMemoryRepository();
  const walletAddressService = new WalletAddressService(walletAddressRepo);
  const eventProducer = new EventEmitterPubSub();
  const ilpPeerService = new IlpPeerService(new IlpPeerInMemoryRepository());
  const ratesService = new RatesService();
  const liquidityService = new LiquidityService();

  const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
    new RemoteIncomingPaymentInMemoryRepository()
  );

  const mockTelemetryService: ITelemetryService = {
    incrementCounter: () => {},
    startTimer: () => () => {},
  };

  const paymentService = new PaymentService(
    walletAddressService,
    ilpPeerService,
    ratesService,
    liquidityService,
    remoteIncomingPaymentService,
    incomingPaymentRepo,
    outgoingPaymentRepo,
    quoteRepo,
    eventProducer,
    mockTelemetryService
  );

  describe("createIncomingPayment", async (t) => {
    describe("throws", async (t) => {
      test("if provided id is not unique", async (t) => {
        const id = randomUUID();
        const request = {
          id,
          walletAddressId: randomUUID(),
        };

        t.mock.method(incomingPaymentRepo, "exists", async () => {
          return true;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          DuplicateIncomingPaymentFoundError,
          "Does not throw DuplicateIncomingPaymentFoundError"
        );
      });

      test("if wallet address is not found", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return undefined;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          WalletAddressNotFoundError,
          "Does not throw WalletAddressNotFoundError"
        );
      });

      test("if wallet address is inactive", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return { isActive: false } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          WalletAddressInactiveError,
          "Does not throw WalletAddressInactiveError"
        );
      });

      test("on wallet address and incomingAmount asset scale mismatch", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          incomingAmount: {
            assetCode: "USD",
            assetScale: 8,
            value: 100n,
          },
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return {
            isActive: true,
            assetCode: "USD",
            assetScale: 2,
          } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          IncomingPaymentWalletAddressAssetMismatchError,
          "Does not throw IncomingPaymentWalletAddressAssetMismatchError"
        );
      });

      test("on wallet address and incomingAmount asset code mismatch", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          incomingAmount: {
            assetCode: "EUR",
            assetScale: 2,
            value: 100n,
          },
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return {
            isActive: true,
            assetCode: "USD",
            assetScale: 2,
          } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          IncomingPaymentWalletAddressAssetMismatchError,
          "Does not throw IncomingPaymentWalletAddressAssetMismatchError"
        );
      });

      test("if invalid expiry (past)", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          expiresAt: new Date(Date.now() - 1000),
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return {
            isActive: true,
          } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          InvalidIncomingPaymentExpiryError,
          "Does not throw InvalidIncomingPaymentExpiryError"
        );
      });

      test("if invalid expiry (exceeds maximum allowed)", async (t) => {
        const now = Date.now();
        t.mock.timers.enable({ apis: ["Date"], now });

        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          expiresAt: new Date(
            now + ((paymentService as any).INCOMING_PAYMENT_MAX_EXPIRY_MS + 1)
          ),
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return {
            isActive: true,
          } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createIncomingPayment(request),
          InvalidIncomingPaymentExpiryError,
          "Does not throw InvalidIncomingPaymentExpiryError"
        );
      });
    });
    describe("succeeds", async (t) => {
      test("without optional fields", async (t) => {
        const walletAddressId = randomUUID();
        const request = {
          walletAddressId,
        };
        const walletAddress: WalletAddress = {
          id: walletAddressId,
          url: "https://example.com",
          isActive: true,
          assetCode: "USD",
          assetScale: 2,
        };
        const now = Date.now();

        t.mock.method(walletAddressService, "getById", async () => {
          return walletAddress;
        });
        const storeSpy = t.mock.method(incomingPaymentRepo, "store");
        const publishSpy = t.mock.method(eventProducer, "publish");
        t.mock.timers.enable({ apis: ["Date"], now });

        const id = await paymentService.createIncomingPayment(request);
        assert(typeof id === "string");

        const expectedIncomingPayment: IncomingPayment = {
          id,
          incomingAmount: undefined,
          receivedAmount: 0n,
          expiresAt: new Date(
            now + (paymentService as any).INCOMING_PAYMENT_DEFAULT_EXPIRY
          ),
          walletAddressId: request.walletAddressId,
          type: "LOCAL",
          state: "CREATED",
          asset: {
            code: walletAddress.assetCode,
            scale: walletAddress.assetScale,
          },
        };

        // Incoming payment stored correctly
        assert.strictEqual(storeSpy.mock.calls.length, 1);
        assert.deepStrictEqual(
          storeSpy.mock.calls[0].arguments[0],
          expectedIncomingPayment,
          "Incoming payment stored incorrectly"
        );

        // Incoming payment event published correctly
        assert.strictEqual(publishSpy.mock.calls.length, 1);
        assert.deepStrictEqual(
          publishSpy.mock.calls[0].arguments[0],
          [
            {
              type: PaymentEventType.INCOMING_PAYMENT_CREATED,
              data: { incomingPayment: expectedIncomingPayment },
            },
          ],
          "Incoming payment event published incorrectly"
        );
      });
      test("with all optional fields", async (t) => {
        const walletAddressId = randomUUID();
        const now = Date.now();
        const request = {
          id: randomUUID(),
          walletAddressId,
          incomingAmount: {
            assetCode: "USD",
            assetScale: 2,
            value: 100n,
          },
          expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000), // 7 days
        };
        const walletAddress: WalletAddress = {
          id: walletAddressId,
          url: "https://example.com",
          isActive: true,
          assetCode: "USD",
          assetScale: 2,
        };

        t.mock.method(walletAddressService, "getById", async () => {
          return walletAddress;
        });
        const storeSpy = t.mock.method(incomingPaymentRepo, "store");
        const publishSpy = t.mock.method(eventProducer, "publish");
        t.mock.timers.enable({ apis: ["Date"], now });

        const id = await paymentService.createIncomingPayment(request);
        assert(typeof id === "string");

        const expectedIncomingPayment: IncomingPayment = {
          id: request.id,
          incomingAmount: request.incomingAmount.value,
          receivedAmount: 0n,
          expiresAt: request.expiresAt,
          walletAddressId: request.walletAddressId,
          type: "LOCAL",
          state: "CREATED",
          asset: {
            code: walletAddress.assetCode,
            scale: walletAddress.assetScale,
          },
        };

        // Incoming payment stored correctly
        assert.strictEqual(storeSpy.mock.calls.length, 1);
        assert.deepStrictEqual(
          storeSpy.mock.calls[0].arguments[0],
          expectedIncomingPayment,
          "Incoming payment stored incorrectly"
        );

        // Incoming payment event published correctly
        assert.strictEqual(publishSpy.mock.calls.length, 1);
        assert.deepStrictEqual(
          publishSpy.mock.calls[0].arguments[0],
          [
            {
              type: PaymentEventType.INCOMING_PAYMENT_CREATED,
              data: { incomingPayment: expectedIncomingPayment },
            },
          ],
          "Incoming payment event published incorrectly"
        );
      });
    });
  });

  describe("createQuote", async (t) => {
    describe("throws", async (t) => {
      test("if provided id is not unique", async (t) => {
        const id = randomUUID();
        const request = {
          id,
          walletAddressId: randomUUID(),
          senderWalletAddressId: randomUUID(),
          incomingPaymentId: randomUUID(),
        };

        t.mock.method(quoteRepo, "exists", async () => {
          return true;
        });

        await assert.rejects(
          paymentService.createQuote(request),
          DuplicateQuoteFoundError,
          "Does not throw DuplicateQuoteFoundError"
        );
      });
      test("if wallet address is not found", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          senderWalletAddressId: randomUUID(),
          incomingPaymentId: randomUUID(),
        };

        await assert.rejects(
          paymentService.createQuote(request),
          WalletAddressNotFoundError,
          "Does not throw WalletAddressNotFoundError"
        );
      });
      test("if wallet address is not active", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          senderWalletAddressId: randomUUID(),
          incomingPaymentId: randomUUID(),
        };

        t.mock.method(walletAddressRepo, "fetchById", async () => {
          return { isActive: false } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createQuote(request),
          WalletAddressInactiveError,
          "Does not throw WalletAddressInactiveError"
        );
      });
      test("if incoming payment is not found", async (t) => {
        const request = {
          id: randomUUID(),
          walletAddressId: randomUUID(),
          senderWalletAddressId: randomUUID(),
          incomingPaymentId: randomUUID(),
        };

        t.mock.method(walletAddressRepo, "fetchById", async () => {
          return { isActive: true } as WalletAddress;
        });

        await assert.rejects(
          paymentService.createQuote(request),
          IncomingPaymentNotFoundError,
          "Does not throw IncomingPaymentNotFoundError"
        );
      });
    });
    // TODO:
    // describe("succeeds", async (t) => {});
  });
});

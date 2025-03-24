require("./telemetry.js"); // Load telemetry before running the rest of the app

import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentService,
  Quote,
} from "./payment";
import { IlpPeerPsqlRepository, IlpPeerService } from "./ilp-peer";
import { RatesService } from "./rates";
import {
  WalletAddressService,
  WalletAddressPsqlRepository,
} from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPaymentPsqlRepository,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import pool from "./db";
import logger from "./logger";
import Redis from "ioredis";
import {
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  QuotePsqlRepository,
  RedisCache,
} from "./repository";
import { Amount } from "./shared";
import { AssetPsqlRepository, AssetService } from "./asset";

const ONE_HOUR_IN_MS = 3_600_000;

const redisUrl = process.env["REDIS_URL"];
if (!redisUrl) {
  throw new Error("Environment variables REDIS_URL is required");
}

const redisClient = new Redis(redisUrl);

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressRepository = new WalletAddressPsqlRepository(
  //TODO new RedisCache<WalletAddress>(redisClient, ONE_HOUR_IN_MS, logger),
  pool,
  logger
);

const assetService = new AssetService(
  new AssetPsqlRepository(pool),
  eventProducer
);
const walletAddressService = new WalletAddressService(
  walletAddressRepository,
  eventProducer
);
const ilpPeerRepository = new IlpPeerPsqlRepository(
  //TODO new RedisCache<IlpPeer>(redisClient, ONE_HOUR_IN_MS, logger),
  //TODO new RedisCache<string>(redisClient, ONE_HOUR_IN_MS, logger),
  pool,
  logger
);
const ilpPeerService = new IlpPeerService(ilpPeerRepository, eventProducer);

const ratesService = new RatesService();
const liquidityService = new LiquidityService();
const remoteIncomingPaymentRepository = new RemoteIncomingPaymentPsqlRepository(
  //TODO new RedisCache<RemoteIncomingPayment>(redisClient, ONE_HOUR_IN_MS, logger),
  pool,
  logger
);
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  remoteIncomingPaymentRepository
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);

const incomingPaymentRepository = new IncomingPaymentPsqlRepository(
  new RedisCache<IncomingPayment>(redisClient, ONE_HOUR_IN_MS, logger),
  pool,
  logger
);
const outgoingPaymentRepository = new OutgoingPaymentPsqlRepository(
  new RedisCache<OutgoingPayment>(
    redisClient,
    ONE_HOUR_IN_MS,
    logger,
    (value: string): OutgoingPayment => {
      const parsed = JSON.parse(value) as Omit<
        OutgoingPayment,
        "debitAmount" | "sentAmount"
      > & {
        debitAmount: string;
        sentAmount: string;
      };
      return {
        ...parsed,
        debitAmount: BigInt(parsed.debitAmount),
        sentAmount: BigInt(parsed.sentAmount),
      };
    }
  ),
  pool,
  logger
);
const quotePaymentRepository = new QuotePsqlRepository(
  new RedisCache<Quote>(
    redisClient,
    ONE_HOUR_IN_MS,
    logger,
    (value: string): Quote => {
      const parsed = JSON.parse(value) as Omit<
        Quote,
        "receiveAmount" | "debitAmount" | "expiresAt"
      > & {
        receiveAmount: Omit<Amount, "value"> & { value: string };
        debitAmount: Omit<Amount, "value"> & { value: string };
        expiresAt: string;
      };
      return {
        ...parsed,
        receiveAmount: {
          ...parsed.receiveAmount,
          value: BigInt(parsed.receiveAmount.value),
        },
        debitAmount: {
          ...parsed.debitAmount,
          value: BigInt(parsed.debitAmount.value),
        },
        expiresAt: new Date(parsed.expiresAt),
      };
    }
  ),
  pool,
  logger
);

const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  incomingPaymentRepository,
  outgoingPaymentRepository,
  quotePaymentRepository,
  eventProducer
);

export {
  pool,
  paymentService,
  PaymentService,
  ilpConnector,
  IlpConnector,
  remoteIncomingPaymentService,
  RemoteIncomingPaymentService,
  walletAddressService,
  ilpPeerService,
  eventConsumer,
  assetService,
  liquidityService,
};

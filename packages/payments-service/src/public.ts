import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPayment,
  OutgoingPayment,
  PaymentService,
  Quote,
} from "./payment";
import { IlpPeer, IlpPeerService } from "./ilp-peer";
import { RatesService } from "./rates";
import { WalletAddressService, WalletAddress } from "./wallet-address";
import { IlpConnector } from "./ilp-connector";
import {
  RemoteIncomingPayment,
  RemoteIncomingPaymentService,
} from "./remote-incoming-payment";
import pool from "./db";
import logger from "./logger";
import Redis from "ioredis";
import {
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  QuotePsqlRepository,
  RemoteIncomingPaymentPsqlRepository,
  RedisCache,
  WalletAddressPsqlRepository,
  IlpPeerPsqlRepository,
  AssetPsqlRepository,
  InMemoryCache,
} from "./repository";
import { Amount } from "./shared";
import { AssetService } from "./asset";
import { TelemetryService } from "telemetry";

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
  new RedisCache<WalletAddress>(redisClient, ONE_HOUR_IN_MS, logger),
  pool,
  logger
);

const liquidityService = new LiquidityService(
  process.env["LIQUIDITY_SERVICE_URL"] as string
);

const assetService = new AssetService(
  new AssetPsqlRepository(pool, logger),
  liquidityService
);
const walletAddressService = new WalletAddressService(
  walletAddressRepository,
  liquidityService
);
const ilpPeerRepository = new IlpPeerPsqlRepository(
  new InMemoryCache<IlpPeer>(ONE_HOUR_IN_MS),
  new InMemoryCache<string>(ONE_HOUR_IN_MS),
  pool,
  logger
);
const ilpPeerService = new IlpPeerService(ilpPeerRepository, liquidityService);

const ratesService = new RatesService();

const remoteIncomingPaymentRepository = new RemoteIncomingPaymentPsqlRepository(
  new InMemoryCache<RemoteIncomingPayment>(ONE_HOUR_IN_MS),
  pool,
  logger
);
const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  remoteIncomingPaymentRepository
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);

const incomingPaymentRepository = new IncomingPaymentPsqlRepository(
  new InMemoryCache<IncomingPayment>(ONE_HOUR_IN_MS),
  pool,
  logger
);
const outgoingPaymentRepository = new OutgoingPaymentPsqlRepository(
  new InMemoryCache<OutgoingPayment>(ONE_HOUR_IN_MS),
  pool,
  logger
);
const quotePaymentRepository = new QuotePsqlRepository(
  new InMemoryCache<Quote>(ONE_HOUR_IN_MS),
  pool,
  logger
);

const telemetryService = TelemetryService.getInstance({
  serviceName: "payments_service",
  collectorUrl:
    process.env["OPEN_TELEMETRY_COLLECTOR_URL"] || "http://otel-collector:4317",
});

const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  incomingPaymentRepository,
  outgoingPaymentRepository,
  quotePaymentRepository,
  eventProducer,
  telemetryService
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
  telemetryService,
};

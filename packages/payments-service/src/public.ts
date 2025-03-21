import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions
} from "./message-broker";
import {createAppCommandHandler} from './app'

require("./telemetry.js"); // Load telemetry before running the rest of the app

import { EventEmitterPubSub } from "./event";
import { LiquidityService } from "./liquidity";
import {
  IncomingPaymentPsqlRepository,
  OutgoingPaymentPsqlRepository,
  PaymentEventType,
  PaymentService,
  QuotePsqlRepository,
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

const eventEmitterPubSub = new EventEmitterPubSub();
const eventConsumer = eventEmitterPubSub;
const eventProducer = eventEmitterPubSub;

const walletAddressService = new WalletAddressService(
  new WalletAddressPsqlRepository(pool)
);
const ilpPeerService = new IlpPeerService(new IlpPeerPsqlRepository(pool));
const ratesService = new RatesService();
const liquidityService = new LiquidityService();

const remoteIncomingPaymentService = new RemoteIncomingPaymentService(
  new RemoteIncomingPaymentPsqlRepository(pool)
);
const ilpConnector = new IlpConnector(ilpPeerService, eventProducer);
const paymentService = new PaymentService(
  walletAddressService,
  ilpPeerService,
  ratesService,
  liquidityService,
  remoteIncomingPaymentService,
  new IncomingPaymentPsqlRepository(pool),
  new OutgoingPaymentPsqlRepository(pool),
  new QuotePsqlRepository(pool),
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
  eventConsumer
};

/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import {
  AssetAggregate, IPalAssetRepository, IPalWalletAddressRepository,
  WalletAddressAggregate
} from 'pal-domain-lib';
import { PalGrpcServer } from './grpc/grpc-service';
import process from 'process';
import {
  CreateLedgerAccountCmdSerde,
  CreateLedgerCmdSerde, ILedgerReadSideRepository,
  MongoDbAssetRepo, MongoDbLedgerReadSideRepo,
  MongoDbWalletRepoRepo
} from 'pal-implementations-lib';
import {ILogger, IMessageConsumer, IMessageProducer, IRawMessageSerializerFactory} from "common-types-lib";
import {
  IKafkaBuilder,
  KafkaBuilder, KafkaConsumerOptions, KafkaProducerCompressionCodecs,
  KafkaProducerOptions,
  MessageSerializationFactory,
  PinoLogger
} from "implementations-lib";
import crypto from "crypto";

const SVC_PORT = process.env["SVC_PORT"] ? parseInt(process.env["SVC_PORT"]) : 50051;
const INSTANCE_ID = `ES_LEDGER_POC_SVC__${crypto.randomUUID()}`;

// Message Consumer/Publisher
const KAFKA_URL =
  process.env['KAFKA_URL'] || '127.0.0.1:29092,127.0.0.1:39092,127.0.0.1:49092';
// const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
// const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
// const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
// const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
// const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

// kafka common options
const kafkaProducerCommonOptions: KafkaProducerOptions = {
  queueBufferingMaxMessages: 100_000,
  compressionCodec: KafkaProducerCompressionCodecs.GZIP,
  messageMaxBytes: 20971520
};
const kafkaConsumerCommonOptions: KafkaConsumerOptions = {
  consumerGroupId: 'PAL_API_SVC',
  batchTimeoutMs: 50,
  batchSize: 50_000
};

const MONGO_URL = process.env['MONGO_URL'] || 'mongodb://localhost:27017/';

export class PalApiService {
  private static _logger: ILogger;
  private static _msgSerializationFactory: IRawMessageSerializerFactory;
  private static _kafkaBuilder: IKafkaBuilder;
  private static _assetRepo: IPalAssetRepository;
  private static _walletRepo: IPalWalletAddressRepository;
  private static _ledgerReadSideRepo: ILedgerReadSideRepository;
  private static _producer: IMessageProducer;
  private static _consumer: IMessageConsumer;
  private static grpcService: PalGrpcServer;

  static async start(
    logger?: ILogger,
    msgSerializationFactory?: IRawMessageSerializerFactory,
    kafkaBuilder?: IKafkaBuilder,
    assetRepo?: IPalAssetRepository,
    walletRepo?: IPalWalletAddressRepository,
    ledgerReadSideRepo?: ILedgerReadSideRepository,
  ): Promise<void> {
    if(!logger){
      logger = new PinoLogger();
    }
    this._logger = logger;

    this._logger.info(`Starting ${this.constructor.name}...`);

    if(!msgSerializationFactory){
      MessageSerializationFactory.instance()
        // we only need the commands
        .register(new CreateLedgerCmdSerde())
        .register(new CreateLedgerAccountCmdSerde());

      msgSerializationFactory = MessageSerializationFactory.instance();
    }
    this._msgSerializationFactory = msgSerializationFactory;

    if(!kafkaBuilder){
      KafkaBuilder.instance()
        .withLogger(this._logger)
        .withBrokerList(KAFKA_URL)
        .withClientId(INSTANCE_ID)
        .withSerializerFactory(this._msgSerializationFactory)
      kafkaBuilder = KafkaBuilder.instance();
    }
    this._kafkaBuilder = kafkaBuilder;

    if(!assetRepo){
      assetRepo = new MongoDbAssetRepo(MONGO_URL);
      await (assetRepo as MongoDbAssetRepo).init();
    }
    this._assetRepo = assetRepo;

    if(!walletRepo){
      walletRepo = new MongoDbWalletRepoRepo(MONGO_URL);
      await (walletRepo as MongoDbWalletRepoRepo).init();
    }
    this._walletRepo = walletRepo;

    if(!ledgerReadSideRepo){
      const repo = new MongoDbLedgerReadSideRepo(MONGO_URL);
      await repo.init()
      ledgerReadSideRepo = repo;
    }
    this._ledgerReadSideRepo = ledgerReadSideRepo;

    // create producer from kafka builder
    this._producer = this._kafkaBuilder.buildProducer(kafkaProducerCommonOptions);
    this._consumer = this._kafkaBuilder.buildConsumer(kafkaConsumerCommonOptions);

    // create aggregates driven by this gRPC port
    const assetAggregate = new AssetAggregate(
      this._assetRepo, this._producer, this._logger
    );
    const walletAggregate = new WalletAddressAggregate(
      this._walletRepo, this._producer, this._logger
    );

    this.grpcService = new PalGrpcServer(
      INSTANCE_ID,
      `0.0.0.0:${SVC_PORT}`,
      assetAggregate,
      walletAggregate,
      this._producer,
      this._consumer,
      this._ledgerReadSideRepo,
      this._logger
    );

    await this.grpcService.start();
  }

  static async stop(): Promise<void> {
    await this.grpcService.stop();

    if(this._producer){
      await this._producer.disconnect();
    }
  }
}

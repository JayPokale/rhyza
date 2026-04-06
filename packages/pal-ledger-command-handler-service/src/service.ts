/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';


import {
  PinoLogger,
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions, RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions,
  SnapshotEventSerializer,
  StateEventSerializer
} from 'implementations-lib';
import {
  LedgerAccountCreatedStateEvent, LedgerAggregate, LedgerCreatedStateEvent, LedgerSnapshotEvent,
  LedgerTransactionRecordedStateEvent
} from 'pal-domain-lib';
import {
  KafkaLedgerEventSourcingRepository,
  LedgerAccountCreatedStateEventSerde,
  LedgerCreatedStateEventSerde,
  LedgerSnapshotSerde
} from 'pal-implementations-lib';
import {
  LedgerTransactionRecordedStateEventSerde
} from 'pal-implementations-lib/dist/serde/payload-serdes/ledger-transaction-recorded-serde';
import crypto from 'crypto';
import process from 'process';
import {
  CommandMsg,
  CommandTopics,
  ILogger,
  IMessage,
  IMessageConsumer, IMessageProducer,
  MessageTypes
} from "common-types-lib";



const INSTANCE_ID = `ES_LEDGER_POC_SVC__${crypto.randomUUID()}`;
const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

// Message Consumer/Publisher
const KAFKA_URL =
  process.env['KAFKA_URL'] || '127.0.0.1:19092,127.0.0.1:29092,127.0.0.1:39092';
// const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
// const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
// const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
// const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
// const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

// kafka common options
const kafkaProducerCommonOptions: RafikiKafkaJsonProducerOptions = {
  kafkaBrokerList: KAFKA_URL,
  producerClientId: `${INSTANCE_ID}`,
  queueBufferingMaxMessages: 500_000
};
const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
  kafkaBrokerList: KAFKA_URL,
  kafkaGroupId: 'ES_LEDGER_POC_COMMAND_SVC',
  batchTimeoutMs: 25,
  batchSize: 100_000
};


export class PalLedgerCommandHandlerService {
  private static _logger: ILogger;
  private static _ledgerAggregate: LedgerAggregate;
  private static _esRepo: KafkaLedgerEventSourcingRepository;
  private static _producer: IMessageProducer;
  private static _consumer: IMessageConsumer;

  static async start(
    logger?: ILogger,
    esRepo?: KafkaLedgerEventSourcingRepository,
    producer?: IMessageProducer,
    consumer?: IMessageConsumer
  ): Promise<void> {
    if(!logger){
      logger = new PinoLogger();
    }
    this._logger = logger;

    this._logger.info(`Starting ${this.constructor.name}...`);

    if(!esRepo){
      const snapshotSerde = SnapshotEventSerializer.instance();
      snapshotSerde.setSerde(LedgerSnapshotEvent.name, new LedgerSnapshotSerde());

      const eventSerde = StateEventSerializer.instance();
      eventSerde.setSerde(LedgerCreatedStateEvent.name, new LedgerCreatedStateEventSerde());
      eventSerde.setSerde(LedgerAccountCreatedStateEvent.name, new LedgerAccountCreatedStateEventSerde());
      eventSerde.setSerde(LedgerTransactionRecordedStateEvent.name, new LedgerTransactionRecordedStateEventSerde());

      esRepo = new KafkaLedgerEventSourcingRepository(
        kafkaProducerCommonOptions,
        kafkaConsumerCommonOptions,
        REDIS_URL,
        snapshotSerde,
        eventSerde,
        this._logger
      );
      await esRepo.init();
    }
    this._esRepo = esRepo;

    if(!producer){
      producer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions, this._logger);
      await producer.connect();
    }
    this._producer = producer;

    this._ledgerAggregate = new LedgerAggregate(this._esRepo, this._producer, this._logger);

    this._ledgerAggregate.printStats();
    this._logger.info("Ledger initialized");

    if(!consumer){
      this._consumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions, this._logger);
      consumer = this._consumer;
    }
    this._consumer = consumer;

    this._consumer.setTopics([CommandTopics.LedgerCommands]);
    this._consumer.setBatchCallbackFn(async (messages:IMessage[]) => {
      // filter out only commands (sort of redundant but good practice)
      const cmds = messages.filter(m => m.msgType === MessageTypes.COMMAND);
      if(cmds.length === 0) return;
      // TODO hook telemetry here
      await this._ledgerAggregate.processCommands(cmds as CommandMsg[]);
    });

    await this._consumer.connect();
    await this._consumer.startAndWaitForRebalance();

    this._logger.info(`${PalLedgerCommandHandlerService.name} ready to receive commands`);
  }

  static async stop(): Promise<void> {}
}

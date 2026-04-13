import crypto from 'crypto';
import process from 'process';
import {
  PinoLogger, RafikiKafkaJsonConsumer,
  RafikiKafkaRawConsumer, RafikiKafkaRawConsumerOptions,
  RafikiKafkaRawConsumerOutputType,
  MessageSerializationFactory, KafkaProducerOptions, IKafkaBuilder, KafkaBuilder, KafkaConsumerOptions,
  KafkaLowLevelConsumer, KafkaLowLevelConsumerOptions
} from 'implementations-lib';
import {
  ILedgerEventSourcingRepository,
} from 'pal-domain-lib';
import {
  CreateLedgerAccountCmdSerde,
  CreateLedgerCmdSerde,
  KafkaLedgerEventSourcingRepository,
  LedgerAccountCreatedStateEventSerde,
  LedgerCreatedStateEventSerde,
  LedgerSnapshotSerde, LedgerTransactionRecordedStateEventSerde, PostTransactionCmdSerde
} from 'pal-implementations-lib';

import {
  ILogger,
  IMessageConsumer,
  IMessageProducer, IRawMessageConsumer, IRawMessageSerializerFactory,
} from "common-types-lib";
import {Snapshotter, SnapshotterConfigs} from "./handlers/snapshotter";
import {IntegrationEventHandler} from "./handlers/integration-event-handler";

const INSTANCE_ID = `ES_LEDGER_POC_SVC__${crypto.randomUUID()}`;
const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

const MAX_EVENTS_PER_SNAPSHOT = 10;
const MAX_SECS_SINCE_LAST_SNAPSHOT = 600;
const MIN_SECS_SINCE_LAST_SNAPSHOT = 10;

// Message Consumer/Publisher
const KAFKA_URL =
  process.env['KAFKA_URL'] || '127.0.0.1:19092,127.0.0.1:29092,127.0.0.1:39092';
// const KAFKA_AUTH_ENABLED = process.env["KAFKA_AUTH_ENABLED"] && process.env["KAFKA_AUTH_ENABLED"].toUpperCase()==="TRUE" || false;
// const KAFKA_AUTH_PROTOCOL = process.env["KAFKA_AUTH_PROTOCOL"] || "sasl_plaintext";
// const KAFKA_AUTH_MECHANISM = process.env["KAFKA_AUTH_MECHANISM"] || "plain";
// const KAFKA_AUTH_USERNAME = process.env["KAFKA_AUTH_USERNAME"] || "user";
// const KAFKA_AUTH_PASSWORD = process.env["KAFKA_AUTH_PASSWORD"] || "password";

// kafka common options
const kafkaProducerCommonOptions: KafkaProducerOptions = {
  queueBufferingMaxMessages: 500_000,
  messageMaxBytes: 20971520
};
const kafkaConsumerCommonOptions: KafkaConsumerOptions = {
  consumerGroupId: 'ES_LEDGER_POC_SNAPSHOTTER_SVC',
  batchTimeoutMs: 10000,
  batchSize: 500_000
};


export class PalLedgerEventHandlerService {
  private static _logger: ILogger;
  private static _esRepo: ILedgerEventSourcingRepository;
  private static _producer: IMessageProducer;
  private static _snapshoterConsumer: IMessageConsumer;
  private static _domainEventsConsumer: IMessageConsumer;
  private static _kafkaBuilder: IKafkaBuilder;
  private static _msgSerializationFactory: IRawMessageSerializerFactory;

  private static _snapshotter: Snapshotter;
  private static _integrationEventHandler: IntegrationEventHandler;

  static async start(
    logger?: ILogger,
    msgSerializationFactory?: IRawMessageSerializerFactory,
    kafkaBuilder?: IKafkaBuilder,
    esRepo?: ILedgerEventSourcingRepository,
    snapshoterConsumer?: IMessageConsumer,
    domainEventsConsumer?: IMessageConsumer,
    producer?: IMessageProducer,
  ): Promise<void> {
    if(!logger){
      logger = new PinoLogger();
    }
    this._logger = logger;

    this._logger.info(`Starting ${PalLedgerEventHandlerService.name}...`);

    if(!msgSerializationFactory){
      MessageSerializationFactory.instance()
        // snapshots
        .register(new LedgerSnapshotSerde())
        // state events
        .register(new LedgerCreatedStateEventSerde())
        .register(new LedgerAccountCreatedStateEventSerde())
        .register(new LedgerTransactionRecordedStateEventSerde())
        // commands
        .register(new CreateLedgerCmdSerde())
        .register(new CreateLedgerAccountCmdSerde())
        .register(new PostTransactionCmdSerde());

      msgSerializationFactory = MessageSerializationFactory.instance();
    }
    this._msgSerializationFactory = msgSerializationFactory;

    if(!kafkaBuilder){
      KafkaBuilder.instance()
        .withLogger(this._logger)
        .withBrokerList(KAFKA_URL)
        .withClientId(INSTANCE_ID)
        .withSerializerFactory(MessageSerializationFactory.instance())
      kafkaBuilder = KafkaBuilder.instance();
    }
    this._kafkaBuilder = kafkaBuilder;

    if(!esRepo){
      // TODO remove
      // const admin = this._kafkaBuilder.buildAdmin();
      // await admin.createTopics([
      //   SnapshotEventTopics.LedgerSnapshotEvents,
      //   StateEventTopics.LedgerStateEvents,
      //   DomainEventTopics.LedgerEvents,
      //   CommandTopics.LedgerCommands
      // ]);

      const kafkaEsRepo = new KafkaLedgerEventSourcingRepository(
        this._kafkaBuilder,
        kafkaProducerCommonOptions,
        REDIS_URL,
        this._logger
      );
      await kafkaEsRepo.init();
      esRepo = kafkaEsRepo;
    }
    this._esRepo = esRepo;

    if(!producer){
      producer = this._kafkaBuilder.buildProducer(kafkaProducerCommonOptions);
      await producer.connect();
    }
    this._producer = producer;


    if(!snapshoterConsumer){
      // snapshoterConsumer = this._kafkaBuilder.buildConsumer(kafkaConsumerCommonOptions);

      const consumerOpts:KafkaLowLevelConsumerOptions ={
        consumerGroupId: kafkaConsumerCommonOptions.consumerGroupId,
        batchSize: kafkaConsumerCommonOptions.batchSize,
        batchTimeoutMs: kafkaConsumerCommonOptions.batchTimeoutMs,
        autoOffsetReset: kafkaConsumerCommonOptions.autoOffsetReset
      }

      snapshoterConsumer = this._kafkaBuilder.buildLowLevelConsumer(consumerOpts);
    }
    this._snapshoterConsumer = snapshoterConsumer;


    /*
    * Instantiate the snapshotter
    */
    const configs:SnapshotterConfigs = {
      maxStateEventsBetweenSnapshots: MAX_EVENTS_PER_SNAPSHOT,
      maxTimeBetweenSnapshotsMs: MAX_SECS_SINCE_LAST_SNAPSHOT * 1000,
      minTimeBetweenSnapshotsMs: MIN_SECS_SINCE_LAST_SNAPSHOT * 1000
    }

    this._snapshotter = new Snapshotter(
      configs,
      this._esRepo,
      this._msgSerializationFactory,
      this._snapshoterConsumer,
      this._producer,
      this._logger
    );

    await this._snapshotter.init();
    this._logger.info(`${this._snapshotter.constructor.name} ready to receive state events`);


    if(!domainEventsConsumer){
      domainEventsConsumer = this._kafkaBuilder.buildConsumer(kafkaConsumerCommonOptions);
    }
    this._domainEventsConsumer = domainEventsConsumer;

    /*
    * Instantiate the integration event handler
    */
    this._integrationEventHandler = new IntegrationEventHandler(
      this._domainEventsConsumer,
      this._producer,
      this._logger
    );
    await this._integrationEventHandler.init();
    this._logger.info(`${this._integrationEventHandler.constructor.name} ready to receive integration events`);

    this._logger.info(`${PalLedgerEventHandlerService.name} started successfully`);
  }

  static async stop(): Promise<void> {
    if(this._snapshotter){
      await this._snapshotter.destroy() ;
    }

    if(this._snapshoterConsumer){
      await this._snapshoterConsumer.stop();
      await this._snapshoterConsumer.disconnect(false);
    }

    if(this._domainEventsConsumer){
      await this._domainEventsConsumer.stop();
      await this._domainEventsConsumer.disconnect(false);
    }

    if(this._producer){
      await this._producer.disconnect();
    }


  }
}

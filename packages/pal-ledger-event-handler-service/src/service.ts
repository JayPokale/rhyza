import crypto from 'crypto';
import process from 'process';
import {
  PinoLogger, RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions, RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions, RafikiKafkaRawConsumer, RafikiKafkaRawConsumerOptions,
  RafikiKafkaRawConsumerOutputType,
  SnapshotEventSerializer,
  StateEventSerializer
} from 'implementations-lib';
import {
  ILedgerEventSourcingRepository,
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
import {
  CommandTopics,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer, IRawMessageConsumer,
  MessageTypes, StateEventTopics
} from "common-types-lib";
import {Snapshotter, SnapshotterConfigs} from "./handlers/snapshotter";
import {StatementSync} from "node:sqlite";
import {IntegrationEventHandler} from "./handlers/integration-event-handler";



const INSTANCE_ID = `ES_LEDGER_POC_SVC__${crypto.randomUUID()}`;
const REDIS_URL = process.env["REDIS_URL"] || "redis://localhost:6379";

const MAX_EVENTS_PER_SNAPSHOT = 10;
const MAX_SECS_SINCE_LAST_SNAPSHOT = 60;

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
  kafkaGroupId: 'ES_LEDGER_POC_SNAPSHOTTER_SVC',
  batchTimeoutMs: 50,
  batchSize: 100_000
};


export class PalLedgerEventHandlerService {
  private static _logger: ILogger;
  private static _esRepo: ILedgerEventSourcingRepository;
  private static _producer: IMessageProducer;
  private static _rawMessageConsumer: IRawMessageConsumer;
  private static _messageConsumer: IMessageConsumer;
  private static _stateEventSerializer: StateEventSerializer;
  private static _snapshotEventSerializer: SnapshotEventSerializer;

  private static _snapshotter: Snapshotter;
  private static _integrationEventHandler: IntegrationEventHandler;

  static async start(
    logger?: ILogger,
    stateEventSerializer?: StateEventSerializer,
    snapshotEventSerializer?: SnapshotEventSerializer,
    esRepo?: ILedgerEventSourcingRepository,
    rawMessageConsumer?: IRawMessageConsumer,
    messageConsumer?: IMessageConsumer,
    producer?: IMessageProducer,
  ): Promise<void> {
    if(!logger){
      logger = new PinoLogger();
    }
    this._logger = logger;

    this._logger.info(`Starting ${this.constructor.name}...`);

    if(!stateEventSerializer){
      const serde = StateEventSerializer.instance();
      serde.setSerde(LedgerCreatedStateEvent.name, new LedgerCreatedStateEventSerde());
      serde.setSerde(LedgerAccountCreatedStateEvent.name, new LedgerAccountCreatedStateEventSerde());
      serde.setSerde(LedgerTransactionRecordedStateEvent.name, new LedgerTransactionRecordedStateEventSerde());
      stateEventSerializer = serde;
    }
    this._stateEventSerializer = stateEventSerializer;

    if(!snapshotEventSerializer){
      const serde = SnapshotEventSerializer.instance();
      serde.setSerde(LedgerSnapshotEvent.name, new LedgerSnapshotSerde());
      snapshotEventSerializer = serde;
    }
    this._snapshotEventSerializer = snapshotEventSerializer;

    if(!esRepo){
      const kafkaEsRepo = new KafkaLedgerEventSourcingRepository(
        kafkaProducerCommonOptions,
        kafkaConsumerCommonOptions,
        REDIS_URL,
        this._snapshotEventSerializer,
        this._stateEventSerializer,
        this._logger
      );
      await kafkaEsRepo.init();
      esRepo = kafkaEsRepo;
    }
    this._esRepo = esRepo;

    if(!producer){
      producer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions, this._logger);
      await producer.connect();
    }
    this._producer = producer;


    if(!rawMessageConsumer){
      this._rawMessageConsumer = new RafikiKafkaRawConsumer(kafkaConsumerCommonOptions, this._logger);
      const rawConsumerOpts: RafikiKafkaRawConsumerOptions = {
        ...kafkaConsumerCommonOptions,
        outputType: RafikiKafkaRawConsumerOutputType.Raw
      }
      this._rawMessageConsumer = new RafikiKafkaRawConsumer(rawConsumerOpts, this._logger);
      rawMessageConsumer = this._rawMessageConsumer;
    }
    this._rawMessageConsumer = rawMessageConsumer;


    /*
    * Instantiate the snapshotter
    */
    const configs:SnapshotterConfigs = {
      maxStateEventsBetweenSnapshots: MAX_EVENTS_PER_SNAPSHOT,
      maxTimeBetweenSnapshotsMs: MAX_SECS_SINCE_LAST_SNAPSHOT * 1000
    }

    this._snapshotter = new Snapshotter(
      configs,
      this._esRepo,
      this._stateEventSerializer,
      this._rawMessageConsumer,
      this._producer,
      this._logger
    );

    await this._snapshotter.init();
    this._logger.info(`${this._snapshotter.constructor.name} ready to receive state events`);

    if(!messageConsumer){
      messageConsumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions, this._logger);
      messageConsumer = messageConsumer;
    }
    this._messageConsumer = messageConsumer;

    /*
    * Instantiate the integration event handler
    */
    this._integrationEventHandler = new IntegrationEventHandler(
      this._messageConsumer,
      this._producer,
      this._logger
    );
    await this._integrationEventHandler.init();
    this._logger.info(`${this._integrationEventHandler.constructor.name} ready to receive integration events`);

    this._logger.info(`${this.constructor} started successfully`);
  }

  static async stop(): Promise<void> {
    if(this._snapshotter){
      await this._snapshotter.destroy() ;
    }
    if(this._rawMessageConsumer){
      await this._rawMessageConsumer.stop();
      await this._rawMessageConsumer.disconnect(false);
    }

    if(this._producer){
      await this._producer.disconnect();
    }


  }
}

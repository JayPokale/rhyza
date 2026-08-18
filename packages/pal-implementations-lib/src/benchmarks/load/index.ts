import {
  CreateLedgerAccountForAssetCmd,
  CreateLedgerAccountsForPeerCmd,
  CreateLedgerCmd,
  IPalPeerAccounts,
  LedgerCommand,
  PostTransactionCmd
} from 'pal-domain-lib';
import {
  KafkaBuilder,
  KafkaConsumerOptions,
  KafkaProducerCompressionCodecs,
  KafkaProducerOptions,
  MessageSerializationFactory
} from 'implementations-lib';
import {
  CreateLedgerAccountForAssetCmdSerde, CreateLedgerAccountsForPeerCmdSerde,
  CreateLedgerCmdSerde, LedgerAccountsCreatedStateEventSerde, LedgerCreatedStateEventSerde, LedgerSnapshotSerde,
  LedgerTransactionRecordedStateEventSerde, PostTransactionCmdSerde
} from '../../';
import {
  CommandMsg,
  ConsoleLogger,
  DomainEvent,
  DomainEventTopics,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  ITelemetryHistogram,
  ITelemetryService,
  MessageTypes,
  NullLogger,
  TELEMETRY_PROPS_CALL_NAME_PROP
} from 'common-types-lib';
import { ISettingsData } from '../common';
import {
  LedgerTransactionPostedEvent
} from 'pal-public-types-lib';
import { EventEmitter } from 'node:events';

// kafka common options
const kafkaProducerCommonOptions: KafkaProducerOptions = {
  compressionCodec: KafkaProducerCompressionCodecs.GZIP,
  queueBufferingMaxMessages: 500_000,
  messageMaxBytes: 20971520 * 2,
  skipAcknowledgements: false
};
const kafkaConsumerCommonOptions: KafkaConsumerOptions = {
  consumerGroupId: `ES_LEDGER_LOAD_TESTS_${crypto.randomUUID()}`,
  batchTimeoutMs: 200,
  batchSize: 500_000,
  autoOffsetReset: 'latest'
};

const ASSET_SYSTEM_ACC_ID = 'system';
const peerAccounts: IPalPeerAccounts = {
  peerLiquidityAccId: 'peerLiquidityAccId',
  peerClearingAccId: 'peerClearingAccId',
  aseLiquidityAccId: 'aseLiquidityAccId',
  aseClearingAccId: 'aseClearingAccId',
  suspenseAccId: 'suspenseAccId'
};

const RESPONSE_TOPICS_TO_LISTEN_TO = [DomainEventTopics.LedgerEvents];
const RESPONSES_HISTOGRAM_NAME = "LoadTestsResponses_histo";

export interface ILoadTestStats {
  isRunning: boolean;
  perSecCount: number;
  lastPublishCycleTookMs: number;
  lastConsumeCycleTookMs: number;
  runningForSecs: number;
  totalMessagesSent: number;
  totalMessagesPending: number;
  avgTimePerMessageMs: number;
}

export interface ILoadTestEvents {
  statsAvailable: [stats: ILoadTestStats];
  stateChanged: [];
  logAvailable: [logLine: string];
}

export class LoadTests extends EventEmitter<ILoadTestEvents> {
  private _settings: ISettingsData;
  private _instanceId: string;
  private _perSecCount: number;
  private _logger: ILogger;
  private _kafkaBuilder: KafkaBuilder | null = null;
  private _msgProducer: IMessageProducer | null = null;
  private _msgConsumer: IMessageConsumer | null = null;
  private _telemetryService: ITelemetryService | null = null;
  private _responsesHisto: ITelemetryHistogram | null = null;

  private _totalMessagesSent = 0;
  private _pendingResponses = 0;
  private _totalTimeMs = 0;
  private _runStartTs: number = 0;
  private _lastPublishCycleTookTs: number = 0;
  private _lastConsumeCycleTookMs: number = 0;
  private _commandsSent: CommandMsg[] = [];
  private _isRunning = false;
  private _stopRequested = false;
  private _connected = false;

  constructor(
    settings: ISettingsData,
    perSecCount: number,
    logger: ILogger,
    instanceId?: string,
    telemetryService?: ITelemetryService
  ) {
    super();
    this._logger = logger;
    this._settings = settings;
    this._perSecCount = perSecCount;
    this._instanceId =
      instanceId ?? `ES_LEDGER_POC_TEST__${crypto.randomUUID()}`;

    if (telemetryService) {
      this._telemetryService = telemetryService;
      this._responsesHisto = this._telemetryService.getHistogram(
        RESPONSES_HISTOGRAM_NAME
      );
    }
  }

  public get connected(): boolean {
    return this._connected;
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get perSecCount(): number {
    return this._perSecCount;
  }
  public set perSecCount(perSecCount: number) {
    this._perSecCount = perSecCount;
  }

  // public set updateHandlerFn(fn: null | (() => void)) {
  //   this._updateHandlerFn = fn;
  // }

  async init(): Promise<void> {
    if (this._msgProducer) return;

    MessageSerializationFactory.instance()
      // snapshots
      .register(new LedgerSnapshotSerde())
      // state events
      .register(new LedgerCreatedStateEventSerde())
      .register(new LedgerAccountsCreatedStateEventSerde())
      .register(new LedgerTransactionRecordedStateEventSerde())
      // commands
      .register(new CreateLedgerCmdSerde())
      .register(new PostTransactionCmdSerde())
      .register(new CreateLedgerAccountForAssetCmdSerde())
      .register(new CreateLedgerAccountsForPeerCmdSerde());

    this._kafkaBuilder = new KafkaBuilder()
      .withLogger(this._logger)
      .withSerializerFactory(MessageSerializationFactory.instance())
      .withBrokerList(this._settings.kafkaUrl)
      .withClientId(this._instanceId);

    this._msgProducer = this._kafkaBuilder.buildProducer(
      kafkaProducerCommonOptions
    );
    // this._msgProducer = kafkaBuilder.buildProducerNew();
    await this._msgProducer.connect();

    this._msgConsumer = this._kafkaBuilder.buildLowLevelConsumer(
      kafkaConsumerCommonOptions
    );
    this._msgConsumer.setTopics(RESPONSE_TOPICS_TO_LISTEN_TO);
    this._msgConsumer.setBatchCallbackFn(
      this._handleDomainEventsBatch.bind(this)
    );
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
    this._connected = true;
    this.emit('stateChanged');
  }

  async setupLedger(): Promise<void> {
    if (!this._msgProducer) {
      throw new Error('Producer not initialized');
    }
    const cmd1 = new CreateLedgerCmd({ id: this._settings.assetCode });
    const cmd2 = new CreateLedgerAccountForAssetCmd(this._settings.assetCode, {
      id: ASSET_SYSTEM_ACC_ID,
      assetCode: this._settings.assetCode
    });
    const cmd3 = new CreateLedgerAccountsForPeerCmd(this._settings.assetCode, {
      ...peerAccounts,
      assetCode: this._settings.assetCode,
      peerId: this._settings.peerId
    });

    const startTs = Date.now();
    await this._msgProducer.send([cmd1, cmd2, cmd3]);
    const endTs = Date.now();
    this._log(`Setup - Created ledger and accounts in ${endTs - startTs}ms`);
  }

  async startOrStop(): Promise<void> {
    if (this._isRunning) {
      this.stop();
    } else {
      await this.start();
    }
  }

  async start(): Promise<void> {
    if (!this._msgProducer) {
      throw new Error('Producer not initialized');
    }
    if (this._isRunning) return;

    this._stopRequested = false;
    this._isRunning = true;
    await this._runCycle();
    this._isRunning = false;
  }

  stop(): void {
    this._log(`Stopping load test in next cycle...`);
    this._stopRequested = true;
  }

  private async _runCycle(): Promise<void> {
    const cmds: CommandMsg[] = [];
    this._runStartTs = Date.now();
    let cycleStartTs: number, sendStartTs: number, sendDuration: number;

    this.emit('stateChanged');

    while (true) {
      if (this._stopRequested) {
        this._stopRequested = false;
        this._isRunning = false;
        this.emit('stateChanged');
        break;
      }

      cmds.length = 0;
      cycleStartTs = Date.now();

      cmds.push(...this._getSimpleTransactionTestCommands());
      this._commandsSent.push(...cmds);

      sendStartTs = Date.now();
      await this._msgProducer!.send(cmds);
      this._pendingResponses += cmds.length;
      this._totalMessagesSent += cmds.length;
      sendDuration = Date.now() - sendStartTs;
      this._lastPublishCycleTookTs = Date.now() - cycleStartTs;

      this._log(
        `${cmds.length} transactions posted, publishing took: ${sendDuration} ms - cycle took: ${this._lastPublishCycleTookTs}`
      );
      if (this._lastPublishCycleTookTs < 1000) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 - this._lastPublishCycleTookTs)
        );
      } else {
        console.warn(
          `WARNING - Cycle took longer than 1 second: ${this._lastPublishCycleTookTs} ms`
        );
      }

      this._calcStatsAndNotify();
    }
  }

  private _calcStatsAndNotify() {
    const stats: ILoadTestStats = {
      isRunning: this._isRunning,
      perSecCount: this._perSecCount,
      lastPublishCycleTookMs: this._lastPublishCycleTookTs,
      lastConsumeCycleTookMs: this._lastConsumeCycleTookMs,
      runningForSecs: (Date.now() - this._runStartTs) / 1000,
      totalMessagesSent: this._totalMessagesSent,
      totalMessagesPending: this._pendingResponses,
      avgTimePerMessageMs:
        this._totalTimeMs / (this._totalMessagesSent - this._pendingResponses)
    };

    this.emit('statsAvailable', stats);
  }

  private async _handleDomainEventsBatch(events: IMessage[]): Promise<void> {
    const cycleStartTs = Date.now();
    for (const event of events) {
      if (
        event.msgTopic != DomainEventTopics.LedgerEvents ||
        event.msgType != MessageTypes.DOMAIN_EVENT
      ) {
        continue;
      }

      this._handleLedgerEvents(event as DomainEvent);
    }

    this._lastConsumeCycleTookMs = Date.now() - cycleStartTs;
    this._log(
      `Received and processed ${events.length} events - consume cycle took: ${this._lastConsumeCycleTookMs} ms`
    );
  }

  private _handleLedgerEvents(event: DomainEvent) {
    let originalCmd: CommandMsg | undefined;
    if (event.msgName === LedgerTransactionPostedEvent.name) {
      const transactionPostedEvt = event as LedgerTransactionPostedEvent;
      const index = this._commandsSent.findIndex(
        (cmd) => cmd.payload.id === transactionPostedEvt.payload.id
      );
      if (index != -1) {
        originalCmd = this._commandsSent[index];
        this._commandsSent.splice(index, 1);
      }
    }

    if (originalCmd) {
      this._pendingResponses--;
      const timeTakenMs = Date.now() - originalCmd.msgTimestamp;
      this._totalTimeMs += timeTakenMs;
      this._responsesHisto?.observe(timeTakenMs * (10 ** 6), {
        [TELEMETRY_PROPS_CALL_NAME_PROP]: originalCmd.msgName
      });
    }
  }

  private _getSimpleTransactionTestCommands(): LedgerCommand[] {
    const cmds: CommandMsg[] = [];

    for (let i = 0; i < this._perSecCount; i++) {
      const amount = BigInt(Math.round(Math.random() * 1000)).toString();
      const [sender, receiver] = this._getRandomPair([
        peerAccounts.aseClearingAccId,
        peerAccounts.peerClearingAccId
      ]) || [peerAccounts.aseClearingAccId, peerAccounts.peerClearingAccId];

      cmds.push(
        new PostTransactionCmd(this._settings.assetCode, {
          id: `${this._settings.testIdPrefix}_${i + this._totalMessagesSent}`,
          amount: amount,
          amountScale: 2,
          debitedAccountId: sender,
          creditedAccountId: receiver
        })
      );
    }

    return cmds;
  }

  private _getRandomPair(array: string[]): [string, string] | undefined {
    if (array.length < 2) return undefined;

    const firstIndex = Math.floor(Math.random() * array.length);
    let secondIndex = Math.floor(Math.random() * array.length);

    while (secondIndex === firstIndex) {
      secondIndex = Math.floor(Math.random() * array.length);
    }
    return [array[firstIndex], array[secondIndex]];
  }

  private _log(args: string): void {
    if (!this._settings.disableConsoleLog) console.log(args);

    this.emit('logAvailable', args);
  }
}

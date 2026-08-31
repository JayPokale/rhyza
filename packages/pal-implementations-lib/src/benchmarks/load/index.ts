import {
  CheckBalanceAndReserveTransferCmd,
  CheckBalanceAndReserveTransferCmdPayload,
  CommitTransferCmd,
  CommitTransferCmdPayload,
  CreateLedgerAccountForAssetCmd,
  CreateLedgerAccountsForPeerCmd,
  CreateLedgerCmd,
  DepositToAseCmd,
  IPalPeerAccounts,
  LedgerCommand
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
  LedgerTransactionRecordedStateEventSerde,
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
import { DEFAULT_ASSET_SCALE, ISettingsData } from '../common';
import {
  ILedgerAccountDto,
  IPalAssetDto, IPalPeerDto,
  LedgerHighLevelSuccessResponseEventPayload,
  LedgerOutgoingTransferCommittedEvent,
  LedgerOutgoingTransferReservedEvent,
  LedgerTransactionPostedEvent
} from 'pal-public-types-lib';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PalClient } from 'pal-client-lib';

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
const ASSET_SCALE = 2;

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
  private _apiClient: PalClient;
  private _logger: ILogger;
  private _kafkaBuilder: KafkaBuilder | null = null;
  private _msgProducer: IMessageProducer | null = null;
  private _msgConsumer: IMessageConsumer | null = null;
  private _telemetryService: ITelemetryService | null = null;
  private _responsesHisto: ITelemetryHistogram | null = null;

  private _asset: IPalAssetDto | null;
  private _peer: IPalPeerDto | null;
  private _accounts: ILedgerAccountDto[];

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
    apiClient: PalClient,
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

    this._apiClient = apiClient;
    this._asset = null;
    this._peer = null;
    this._accounts = [];

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

  public get asset(): IPalAssetDto | null {
    return this._asset;
  }
  public get peer(): IPalPeerDto | null {
    return this._peer;
  }
  public get accounts(): ILedgerAccountDto[] {
    return this._accounts;
  }

  async init(): Promise<void> {
    if (this._connected) return;

    await this._apiClient.init();
    await this._fetchAssetAndPeerFromApi();
    await this._fetchAccountsFromApi();
    if(this.checkSetupRequired()) {
      this._logger.debug('No asset, peer or accounts exists, should run setup?');
    }

    MessageSerializationFactory.instance()
      // snapshots
      .register(new LedgerSnapshotSerde())
      // state events
      .register(new LedgerCreatedStateEventSerde())
      .register(new LedgerAccountsCreatedStateEventSerde())
      .register(new LedgerTransactionRecordedStateEventSerde())
      // commands
      .register(new CreateLedgerCmdSerde())
      // .register(new PostTransactionCmdSerde())
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

  checkSetupRequired():boolean{
    return !this._asset || !this._peer || this._accounts.length === 0;
  }

  async setupLedger(): Promise<void> {
    if (!this._msgProducer) {
      throw new Error('Producer not initialized');
    }
    if(!this._asset){
      this._log('Asset not found, creating...');
      await this._apiClient.createAsset(
        this._settings.assetCode,
        DEFAULT_ASSET_SCALE
      );
      this._asset = await this._apiClient.getAsset(this._settings.assetCode);
      this._log(`Asset created: ${JSON.stringify(this._asset)}`);
    }else{
      this._log('Asset found, skipping creation.');
    }

    if(!this._peer){
      this._log('Peer not found, creating...');
      await this._apiClient.createPeer(
        this._settings.peerId,
        `Benchmarks Test Peer - ${this._settings.testIdPrefix}`,
        this._settings.assetCode,
        DEFAULT_ASSET_SCALE,
        "ilpPrefix"
      );
      this._peer = await this._apiClient.getPeer(this._settings.peerId);
      this._log(`Peer created: ${JSON.stringify(this._peer)}`);
    }else{
      this._log('Peer found, skipping creation.');
    }

    if(!this._accounts.length){
      this._log('Accounts not found, creating...');
      let tries = 0;
      while (true) {
        await this._fetchAccountsFromApi();
        if (this._accounts.length > 0) break;

        if (tries++ > 10) {
          this._log(
            `Peer creation failed, could not get accounts after ${tries} tries.`
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }else{
      this._log('Accounts found, skipping creation.');
    }

    this._log('Requesting ASE deposit...');

    const cmds: CommandMsg[] = [
      // new CreateLedgerCmd({ id: this._settings.assetCode }),
      // new CreateLedgerAccountForAssetCmd(this._settings.assetCode, {
      //   id: ASSET_SYSTEM_ACC_ID,
      //   assetCode: this._settings.assetCode
      // }),
      // new CreateLedgerAccountsForPeerCmd(this._settings.assetCode, {
      //   ...peerAccounts,
      //   assetCode: this._settings.assetCode,
      //   peerId: this._settings.peerId
      // }),
      new DepositToAseCmd({
        requestId: randomUUID(),
        assetCode: this._settings.assetCode,
        peerId: this._settings.peerId,
        amount: Number.MAX_SAFE_INTEGER.toString(),
        amountScale: ASSET_SCALE
      })
    ];

    const startTs = Date.now();
    await this._msgProducer.send(cmds);
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

      // cmds.push(...this._getSimpleTransactionTestCommands());
      cmds.push(...this._getComplexTransactionTestCommands());
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

  resetStats(): void {
    this._totalTimeMs = 0;
    this._totalMessagesSent = 0;
    this._lastPublishCycleTookTs = 0;
    this._lastConsumeCycleTookMs = 0;
  }

  private async _fetchAssetAndPeerFromApi(): Promise<void> {
    const accountIds: string[] = [];

    this._asset = await this._apiClient.getAsset(this._settings.assetCode);
    if (this._asset) {
      this._log(
        `Got asset data for assetCode: ${this._asset.code} - ${JSON.stringify(this._asset)}`
      );

      if (this._asset.ledgerAccountId) {
        accountIds.push(this._asset.ledgerAccountId);
      }
    }

    this._peer = await this._apiClient.getPeer(this._settings.peerId);
    if (this._peer) {
      this._log(
        `Got peer data for peerId: ${this._peer.id} - ${JSON.stringify(this._peer)}`
      );

      if (this._peer.ledgerAccounts) {
        accountIds.push(
          this._peer.ledgerAccounts.aseLiquidityAccId,
          this._peer.ledgerAccounts.aseClearingAccId,
          this._peer.ledgerAccounts.peerLiquidityAccId,
          this._peer.ledgerAccounts.peerClearingAccId,
          this._peer.ledgerAccounts.suspenseAccId
        );
      }
    }

    if (accountIds.length) {
      this._accounts = await this._apiClient.getLedgerAccounts(accountIds);

      if (this._accounts) {
        this._log(
          `Got accounts data for accountIds: ${accountIds} - ${JSON.stringify(this._accounts)}`
        );
      }
    }
  }

  private async _fetchAccountsFromApi(): Promise<void> {
    const accountIds: string[] = [];

    if (this._asset && this._asset.ledgerAccountId) {
      accountIds.push(this._asset.ledgerAccountId);
    }

    if (this._peer && this._peer.ledgerAccounts) {
      accountIds.push(
        this._peer.ledgerAccounts.aseLiquidityAccId,
        this._peer.ledgerAccounts.aseClearingAccId,
        this._peer.ledgerAccounts.peerLiquidityAccId,
        this._peer.ledgerAccounts.peerClearingAccId,
        this._peer.ledgerAccounts.suspenseAccId
      );
    }

    if (accountIds.length) {
      this._accounts = await this._apiClient.getLedgerAccounts(accountIds);

      if (this._accounts) {
        this._log(
          `Got accounts data for accountIds: ${accountIds} - ${JSON.stringify(this._accounts)}`
        );
      }
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

      // this._handleSimpleTransactionLedgerEvents(event as DomainEvent);
      this._handleComplexTransactionLedgerEvent(event as DomainEvent);
    }

    this._lastConsumeCycleTookMs = Date.now() - cycleStartTs;
    this._log(
      `Received and processed ${events.length} events - consume cycle took: ${this._lastConsumeCycleTookMs} ms`
    );
  }

  private _handleSimpleTransactionLedgerEvents(event: DomainEvent) {
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
      this._responsesHisto?.observe(timeTakenMs * 10 ** 6, {
        [TELEMETRY_PROPS_CALL_NAME_PROP]: originalCmd.msgName
      });
    }
  }

  private _handleComplexTransactionLedgerEvent(
    event: DomainEvent
  ): CommandMsg[] {
    let originalCmd: CommandMsg | undefined;
    const returnCommands: CommandMsg[] = [];

    if (event.msgName === LedgerOutgoingTransferReservedEvent.name) {
      // 2nd step, reservation was successful, we must now commit
      const payload =
        event.payload as LedgerHighLevelSuccessResponseEventPayload;
      const reqId = `${payload.requestId}_commit`;
      returnCommands.push(
        new CommitTransferCmd(this._settings.assetCode, {
          requestId: reqId,
          transferId: payload.transferId,
          paymentId: payload.paymentId,
          paymentIntentId: payload.paymentIntentId,
          transferDirection: 'OUTGOING'
        })
      );
      const index = this._commandsSent.findIndex(
        (cmd) =>
          (cmd.payload as CheckBalanceAndReserveTransferCmdPayload)
            .requestId === payload.requestId
      );
      if (index != -1) {
        originalCmd = this._commandsSent[index];
        this._commandsSent.splice(index, 1);
      }
    } else if (event.msgName === LedgerOutgoingTransferCommittedEvent.name) {
      // 3rd step, transfer was completed
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
      this._responsesHisto?.observe(timeTakenMs * 10 ** 6, {
        [TELEMETRY_PROPS_CALL_NAME_PROP]: originalCmd.msgName
      });
    }

    return returnCommands;
  }

  /*private _getSimpleTransactionTestCommands(): LedgerCommand[] {
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
  }*/

  private _getComplexTransactionTestCommands(): LedgerCommand[] {
    const cmds: CommandMsg[] = [];

    for (let i = 0; i < this._perSecCount; i++) {
      const amount = BigInt(Math.round(Math.random() * 1000)).toString();
      const reqId = `${this._settings.testIdPrefix}_${i + this._totalMessagesSent}`;

      cmds.push(
        new CheckBalanceAndReserveTransferCmd(this._settings.assetCode, {
          requestId: reqId,
          transferId: `${reqId}_transferId`,
          paymentIntentId: `${reqId}_paymentIntentId`,
          paymentId: `${reqId}_paymentIntentId`,
          peerId: this._settings.peerId,
          transferDirection: 'OUTGOING',
          amount: amount,
          amountScale: 2
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

import {
  ILogger,
  IMessageProducer,
  IRawMessage, IRawMessageConsumer, IRawMessageSerializerFactory,
  MessageTypes,
  StateEvent, StateEventTopics
} from "common-types-lib";
import {ILedgerEventSourcingRepository, LedgerAggregate, LedgerSnapshotEvent, LedgerStateEvent} from "pal-domain-lib";

export type SnapshotterConfigs = {
    maxStateEventsBetweenSnapshots: number;
    maxTimeBetweenSnapshotsMs: number;
}

export class Snapshotter {
    private readonly _logger: ILogger;
    private readonly _configs:SnapshotterConfigs;
    private readonly _esRepo: ILedgerEventSourcingRepository;
    private readonly _aggregate: LedgerAggregate;
    private readonly _uncommittedSnapshots: LedgerSnapshotEvent[];
    private readonly _msgSerializationFactory: IRawMessageSerializerFactory;
    private readonly _rawMessageConsumer: IRawMessageConsumer;
    private readonly _msgProducer: IMessageProducer;

    constructor(
      configs:SnapshotterConfigs, esRepo: ILedgerEventSourcingRepository,
      msgSerializationFactory: IRawMessageSerializerFactory, rawMessageConsumer: IRawMessageConsumer,
      msgProducer: IMessageProducer, logger: ILogger
    ){
        this._logger = logger;
        this._configs = configs;
        this._esRepo = esRepo;
        this._msgSerializationFactory = msgSerializationFactory;
        this._rawMessageConsumer = rawMessageConsumer;
        this._msgProducer = msgProducer;
        this._aggregate = new LedgerAggregate(this._esRepo, this._msgProducer, logger);
        this._uncommittedSnapshots = [];
    }

    private async _applyLedgerEventsAndSnapshotIfNeeded(ledgerId:string, stateEvents: LedgerStateEvent[]){
        const ledger = await this._aggregate.getOrLoadLedger(ledgerId, true);
        if(!ledger) {
            this._logger.warn("Ledger with aggregateId not found");
            return;
        }

        // filter out events prior to current version
        const eventsToLoad = stateEvents.filter(e => BigInt(e.aggregateVersion) > ledger.version);

        if(eventsToLoad.length > 0) {
            await ledger.load(null, eventsToLoad, true);
        }


        // do we need to take a snapshot now?
        if (ledger.version <= ledger.lastSnapshotVersion + BigInt(this._configs.maxStateEventsBetweenSnapshots)) {
            return;
        }

        const lastEvent = stateEvents[stateEvents.length - 1];
        let lastEventIndex: {partition:number, offset:number} | undefined = undefined;
        if(lastEvent.msgPartition != null && lastEvent.msgOffset != null) {
            lastEventIndex = {
                partition: lastEvent.msgPartition,
                offset: lastEvent.msgOffset
            };
        }

        const snapshot = ledger.executeSnapshot(lastEventIndex);
        this._uncommittedSnapshots.push(snapshot);
    }

    private async _handleStateMessages(rawMessages: IRawMessage[]): Promise<void> {
        const startTs = Date.now();
        const map = new Map<string, LedgerStateEvent[]>();

        // deserialize
        const messages = rawMessages.map(this._msgSerializationFactory.deserialize.bind(this._msgSerializationFactory));

        // sort by ledger
        for (const msg of messages) {
            if(msg.msgType !== MessageTypes.STATE_EVENT) {
                this._logger.warn("Invalid message type is not StateEvent");
                continue;
            }
            const aggregateId = (msg as StateEvent).aggregateId;
            if(!aggregateId) {
                this._logger.warn("Invalid aggregateId in StateEvent");
                continue;
            }

            const aggEvents = map.get(aggregateId) || [];
            aggEvents.push(msg as LedgerStateEvent);
            map.set(aggregateId, aggEvents);
        }

        // go through ledger and apply events
        for (const [aggregateId, stateEvents] of map) {
              await this._applyLedgerEventsAndSnapshotIfNeeded(aggregateId, stateEvents);
        }

        if(this._uncommittedSnapshots.length > 0){
            await this._esRepo.publishSnapshotEvent(this._uncommittedSnapshots);
        }

        this._logger.info(`Received ${messages.length} state events, created ${this._uncommittedSnapshots.length} snapshots - in ${Date.now() - startTs}ms`);
        this._uncommittedSnapshots.length = 0; //reset state
    }

    async init():Promise<void>{
        this._rawMessageConsumer.setTopics([StateEventTopics.LedgerStateEvents]);
        this._rawMessageConsumer.setBatchCallbackFn(this._handleStateMessages.bind(this));
        await this._rawMessageConsumer.connect();
        await this._rawMessageConsumer.startAndWaitForRebalance();

        this._logger.info(`${this.constructor.name} initialized`);
    }

    async destroy():Promise<void>{
        await this._rawMessageConsumer.stop();
        return;
    }

}

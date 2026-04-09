import { Redis } from 'ioredis';
import {
  CommandTopics,
  DomainEventTopics,
  ILogger, IMessageProducer,
  IRawMessage,
  IRawMessageProducer, IRawMessageSerializerFactory, MessageDataFormats,
  SnapshotEvent,
  SnapshotEventTopics, StateEventTopics
} from 'common-types-lib';
import {
  KafkaJavascriptProtobufFetcher, KafkaProducer, KafkaProducerOptions,
  RafikiKafkaJsonFetcherOptions,
  RafikiKafkaJsonProducerOptions
} from 'implementations-lib';
import {ILedgerEventSourcingRepository, LedgerSnapshotEvent, LedgerStateEvent} from "pal-domain-lib";

const CACHE_PREFIX = "LEDGER_ES_SNAPSHOT_";

type SnapshotCacheData = {
    topic: string;
    partition: number;
    lastMsgOffset: number;
}

export class KafkaLedgerEventSourcingRepository implements ILedgerEventSourcingRepository {
    private readonly _logger:ILogger
    private readonly _producer: IMessageProducer;
    private readonly _consumerOptions: RafikiKafkaJsonFetcherOptions;
    private readonly _redisClient: Redis;
    private readonly _serializerFactory: IRawMessageSerializerFactory;

    private readonly _msgFormat: MessageDataFormats = MessageDataFormats.PROTOBUF;

    constructor(
      producerOptions: KafkaProducerOptions, consumerOptions: RafikiKafkaJsonFetcherOptions,
      redisConnStr:string, serializerFactory: IRawMessageSerializerFactory,
      logger:ILogger
    ) {
        this._logger = logger;
        this._consumerOptions = consumerOptions;
        this._producer = new KafkaProducer(producerOptions, serializerFactory, logger);
        this._serializerFactory = serializerFactory;

        this._redisClient = new Redis(redisConnStr, {
            lazyConnect: true
        });
    }

    private _getSnapshotKey(aggregateId: string): string {
        return `${CACHE_PREFIX}_${aggregateId}`;
    }

    async init(): Promise<void> {
        await this._producer.connect();

        // TODO remove
        await (this._producer as KafkaProducer).createTopics([
          SnapshotEventTopics.LedgerSnapshotEvents,
          StateEventTopics.LedgerStateEvents,
          DomainEventTopics.LedgerEvents,
          CommandTopics.LedgerCommands
        ]);

        await this._redisClient.connect();

        return Promise.resolve();
    }

    async publishEvents(events:LedgerStateEvent[]):Promise<void> {
        // const rawMsgs:IRawMessage[] = events.map(this._getRawMessageFromIMessage);
        // const rawMsgs:IRawMessage[] = events.map(this._serializerFactory.serialize.bind(this._serializerFactory));
        await this._producer.sendWithAck(events);
    }

    async publishSnapshotEvent(events:LedgerSnapshotEvent[]):Promise<void>{
        // not efficient, but we don't expect to have many snapshots at the same time'

        for(const evt of events) {
            // const rawEvt = this._getRawMessageFromIMessage(evt);
            //const rawEvt = this._serializerFactory.serialize(evt);
            const ack = await this._producer.sendWithAck([evt]);

            const cache: SnapshotCacheData = {
                topic: ack[0].topic,
                partition: ack[0].partition,
                lastMsgOffset: ack[0].lastMsgOffset - 1,
            }

            await this._redisClient.set(
                this._getSnapshotKey(evt.aggregateId),
                JSON.stringify(cache)
            );
        }
    }

/*    async fetchLastSnapshot(aggId: string): Promise<SnapshotEvent | null> {
        const fetcher = new RafikiKafkaJsonFetcher(this._consumerOptions, this._logger);
        const snapShot = await fetcher.fetchLast(aggId, LedgerMessageTopics.SNAPSHOT_EVENTS);

        return snapShot as SnapshotEvent || null;
    }*/

    async fetchLastSnapshot(aggId: string): Promise<LedgerSnapshotEvent | null> {
        let partitionAndOffset: { partition: number, offset: number } | undefined = undefined;

        const cached = await this._redisClient.get(this._getSnapshotKey(aggId));
        if(cached) {
            try{
                const cache = JSON.parse(cached) as SnapshotCacheData;
                if(cache){
                    partitionAndOffset = {
                        partition: cache.partition,
                        offset: cache.lastMsgOffset
                    }
                }
            }catch(e) {
                this._logger.error(`Error parsing cached snapshot for ${aggId}`, e);
                // ignore, keep going
            }
        }

        const fetcher = new KafkaJavascriptProtobufFetcher(this._consumerOptions, this._logger);
        const snapShot = await fetcher.fetchLast(
          aggId,
          SnapshotEventTopics.LedgerSnapshotEvents,
          partitionAndOffset
        );
        if(!snapShot) {
            return null;
        }

        // convert message
        const snapShotMsg = this._serializerFactory.deserialize(snapShot) as SnapshotEvent;
        return snapShotMsg;
    }

    async fetchStateEvents(aggId: string, partitionAndOffset?: { partition: number, offset: number }): Promise<LedgerStateEvent[]> {
        const fetcher = new KafkaJavascriptProtobufFetcher(this._consumerOptions, this._logger);
        const rawEvents = await fetcher.fetchAll(
          aggId,
          StateEventTopics.LedgerStateEvents,
          partitionAndOffset
        );
        if(rawEvents.length === 0) {
            return [];
        }

        const stateEvents = rawEvents.map(this._serializerFactory.deserialize.bind(this._serializerFactory)) as LedgerStateEvent[];
        return stateEvents;
    }


}

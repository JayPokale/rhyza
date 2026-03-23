import { IRawAuthenticationOptions } from '../raw-types';
import { ILogger, IMessage, IRawMessage, IStateMessageFetcher } from 'common-types-lib';
import { RafikiKafkaRawFetcher } from '../node-rdkafka-raw/rdkafka_raw_fetcher';



export class RafikiKafkaJsonFetcherOptions {
    kafkaBrokerList!: string;
    kafkaGroupId?: string;
    sessionTimeoutMs?: number; //Client group session and failure detection timeout, default is 45 secs
    authentication?: IRawAuthenticationOptions;
}

export class RafikiKafkaJsonFetcher implements IStateMessageFetcher {
    private readonly _logger: ILogger | null;
    private readonly _fetcher: RafikiKafkaRawFetcher;

    constructor(config: RafikiKafkaJsonFetcherOptions, logger: ILogger | null = null) {
        this._logger = logger;
        this._fetcher = new RafikiKafkaRawFetcher(config, logger);
    }

    private _convertMsg(message: IRawMessage): IMessage {
        const valueObj = message.value as IMessage;
        valueObj.msgPartition = message.partition;
        valueObj.msgOffset = message.offset;
        valueObj.msgTopic = message.topic;

        // TODO convert the headers (at least the known ones)
        return valueObj;
    }

    async fetchLast(msgKey: string, topic: string, partitionAndOffset?: { partition: number, offset: number }): Promise<IMessage | null> {
        const snapshotRawMsg = await this._fetcher.fetchLast(msgKey, topic, partitionAndOffset);
        if(!snapshotRawMsg) return null;

        return this._convertMsg(snapshotRawMsg)
    }
    async fetchAll(msgKey: string, topic: string, partitionAndOffset?: { partition: number, offset: number }): Promise<IMessage[]> {
        const eventsRawMsgs = await this._fetcher.fetchAll(msgKey, topic, partitionAndOffset);

        return eventsRawMsgs.map(this._convertMsg);
    }




}

import {KafkaJS} from "@confluentinc/kafka-javascript";
import { ILogger, IRawMessage, IRawMessageFetcher } from 'common-types-lib';
import { RafikiKafkaJsonFetcherOptions } from '../node-rdkafka-json/rdkafka_json_fetcher';

export class KafkaJavascriptProtobufFetcher implements IRawMessageFetcher {
    private readonly _logger: ILogger | null;
    private readonly _config: RafikiKafkaJsonFetcherOptions;

    constructor(config: RafikiKafkaJsonFetcherOptions, logger: ILogger | null = null) {
        this._logger = logger;
        this._config = config;

        // make sure the consumer group id is random
        this._config.kafkaGroupId = `${this._config.kafkaGroupId || this.constructor.name}_${crypto.randomUUID()}`;
    }

    private _formatMessage(kafkaMsg: KafkaJS.KafkaMessage, topic: string, partition: number): IRawMessage {
        let retMsg:IRawMessage = {
            topic: topic,
            partition: partition,
            offset: Number(kafkaMsg.offset),
            key: kafkaMsg.key ? kafkaMsg.key.toString() : null,
            timestamp: Number(kafkaMsg.timestamp),
            value: kafkaMsg.value || null,
            headers: null
        }

        // parse headers
        if(kafkaMsg.headers != null && Object.keys(kafkaMsg.headers).length > 0){
            retMsg.headers = [];
            for(const k of Object.keys(kafkaMsg.headers)){
                if(kafkaMsg.headers[k] != null) {
                    retMsg.headers.push({[k]: kafkaMsg.headers[k].toString()});
                }
            }
        }

        return retMsg;
    }

    private async _fetch(topic: string, msgKey:string, partitionAndOffset?:{partition:number,offset:number}): Promise<IRawMessage[]> {
        const groupId = `${this.constructor.name}-${crypto.randomUUID()}`;

        const kafka = new KafkaJS.Kafka({
            kafkaJS: {
                brokers: this._config.kafkaBrokerList.split(","),
            }
        });

        const consumer = kafka.consumer({
            kafkaJS: {
                groupId: groupId,
                fromBeginning: true,
                partitionAssigners: [KafkaJS.PartitionAssigners.roundRobin],
                autoCommit: false,
            }
        });
        await consumer.connect();
        await consumer.subscribe({topic: topic });

        if(partitionAndOffset){
            consumer.seek({
                topic: topic,
                partition: partitionAndOffset.partition,
                offset: partitionAndOffset.offset.toString()
            });
        }

        const admin = kafka.admin();
        await admin.connect();

        // from the topic offsets, get the partitions that have messages
        let topicOffsets = await admin.fetchTopicOffsets(topic);
        let partitionsReading = topicOffsets
            .filter(t => {
                return t.low!=t.high && (!partitionAndOffset || t.partition === partitionAndOffset.partition) && (!partitionAndOffset || Number(t.offset) > partitionAndOffset.offset)
            })
            .map(t => {
                return {partition: t.partition, high: t.high}
            });

        if(partitionsReading.length === 0) {
            return [];
        }

        let msgsRead = 0;

        return new Promise((resolve, reject) => {
            let retMsgs:IRawMessage[] = [];

            const checkIfMoreMsgsOrExit = (partition: number, lastMsgOffset: number) => {
                const offset = topicOffsets.find(o => o.partition === partition);
                if(offset && Number(offset.high) === lastMsgOffset+1) {
                    partitionsReading = partitionsReading.filter(p => p.partition !== partition);
                    if(partitionsReading.length > 0) return;

                    consumer.disconnect().then(() => {
                        this._logger?.debug(`Fetched ${msgsRead} messages from topic ${topic} partition ${partitionAndOffset?.partition || 0} first offset ${partitionAndOffset?.offset || 0} last offset ${lastMsgOffset-1}`);
                        return resolve(retMsgs);
                    });
                }
            }

            consumer.run({eachBatch: async (batchPayload:KafkaJS.EachBatchPayload) => {
                    //this._logger?.debug(`Got batch with ${batchPayload.batch.messages.length} messages from topic ${batchPayload.batch.topic} partition ${batchPayload.batch.partition} first offset ${batchPayload.batch.firstOffset()} last offset ${batchPayload.batch.lastOffset()}`);

                    for (const kafkaMsg of batchPayload.batch.messages) {
                        const msg = this._formatMessage(kafkaMsg, batchPayload.batch.topic, batchPayload.batch.partition);
                        if(msg.key === msgKey) {
                            retMsgs.push(msg);
                        }

                        msgsRead++;
                        checkIfMoreMsgsOrExit(batchPayload.batch.partition , Number(kafkaMsg.offset));
                    }
                }});

        });
    }

    async fetchLast(msgKey: string, topic: string, partitionAndOffset?: { partition: number, offset: number }): Promise<IRawMessage | null> {
        const msgs = await this._fetch(topic, msgKey, partitionAndOffset);
        return msgs?.[msgs.length-1] || null;
    }
    async fetchAll(msgKey: string, topic: string, partitionAndOffset?: { partition: number, offset: number }): Promise<IRawMessage[]> {
        const msgs = await this._fetch(topic, msgKey, partitionAndOffset);
        return msgs;
    }


}

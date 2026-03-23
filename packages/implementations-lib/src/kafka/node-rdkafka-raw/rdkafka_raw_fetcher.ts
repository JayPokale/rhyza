/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import crypto from "crypto";
import * as RDKafka from "node-rdkafka";
import { RafikiKafkaRawConsumerOutputType } from './rdkafka-raw-consumer';
import { ILogger, IRawMessage, IRawMessageFetcher } from 'common-types-lib';
import { IRawAuthenticationOptions } from '../raw-types';

const defaultOptions = {
    useSyncCommit: false,
    outputType: RafikiKafkaRawConsumerOutputType.Json,
    batchSize: 100,
    batchTimeoutMs: 10,
};

export class RafikiKafkaRawFetcherOptions {
    kafkaBrokerList!: string;
    kafkaGroupId?: string;
    consumerClientId?: string;
    outputType?: RafikiKafkaRawConsumerOutputType;
    messageMaxBytes?: number;
    sessionTimeoutMs?: number; //Client group session and failure detection timeout, default is 45 secs
    batchSize?: number;
    batchTimeoutMs?: number;
    authentication?: IRawAuthenticationOptions;
}


export class RafikiKafkaRawFetcher implements IRawMessageFetcher {
    private readonly _logger: ILogger | null;
    private _options: RafikiKafkaRawFetcherOptions;
    private _globalConfig: RDKafka.ConsumerGlobalConfig = {};
    private _topicConfig: RDKafka.ConsumerTopicConfig = {};
    private _batchSize = defaultOptions.batchSize;

    constructor(options: RafikiKafkaRawFetcherOptions, logger: ILogger | null = null) {
        this._options = options;
        this._logger = logger;

        // parse options and apply defaults
        this._parseOptionsAndApplyDefault();
    }

    private _parseOptionsAndApplyDefault(): void {
        this._globalConfig = {};
        this._topicConfig = {};

        this._globalConfig.rebalance_cb = true
        this._globalConfig.event_cb = false;

        // apply local defaults - if not provided by options
        if (this._options.outputType === undefined) {
            this._options.outputType = defaultOptions.outputType;
        }

        if (this._options.batchSize === undefined) {
            this._options.batchSize = defaultOptions.batchSize;
        }

        if (this._options.batchTimeoutMs === undefined) {
            this._options.batchTimeoutMs = defaultOptions.batchTimeoutMs;
        }

        // apply rddkafka required
        if (this._options.consumerClientId !== undefined) {
            this._globalConfig["client.id"] = this._options.consumerClientId;
        }

        if (this._options.messageMaxBytes !== undefined) {
            this._globalConfig["message.max.bytes"] = this._options.messageMaxBytes;
        }

        if (this._options.sessionTimeoutMs !== undefined) {
            this._globalConfig["session.timeout.ms"] = this._options.sessionTimeoutMs;
        }

        // group.id is required, if not provided, generate a random one
        this._globalConfig["group.id"] = this._options.kafkaGroupId || crypto.randomUUID();

        this._globalConfig["enable.partition.eof"] = true; // important to receive the eof event

        // topic configs

        this._topicConfig["auto.offset.reset"] = "beginning"; // critical for the fetcher

        // global client options
        this._globalConfig["metadata.broker.list"] = this._options.kafkaBrokerList;
        this._globalConfig["fetch.wait.max.ms"] = this._options.batchTimeoutMs;

        this._batchSize = this._options.batchSize;

        // authentication options
        if (this._options.authentication != undefined) {
            this._globalConfig["security.protocol"] =
                this._options.authentication.protocol;
            this._globalConfig["sasl.mechanism"] =
                this._options.authentication.mechanism;
            this._globalConfig["sasl.username"] =
                this._options.authentication.username;
            this._globalConfig["sasl.password"] =
                this._options.authentication.password;
        }


        this._logger?.info(`${this.constructor.name} - options: ${JSON.stringify(this._options,null, 2)}`);
        this._logger?.info(`${this.constructor.name} - global: ${JSON.stringify(this._globalConfig,null,2)}`);
        this._logger?.info(`${this.constructor.name} - topic: ${JSON.stringify(this._topicConfig,null, 2)}`);
    }

    /**
     * Fetch the last message for a given aggregateId from a specified or all partitions.
     */
    async fetchLast(msgKey: string, topic: string, partitionAndOffset?:{partition:number,offset:number}): Promise<IRawMessage | null> {
        return new Promise((resolve, reject) => {
            const processMessages = (messages: RDKafka.Message[]) => {
                kafkaConsumer.disconnect(); // don't care to wait

                for (const message of messages) {
                    const parsedMessage = this.formatMessage(message);
                    if (parsedMessage.key === msgKey) {
                        return resolve(parsedMessage);
                    }
                }

                resolve(null); // No matching message found
            };

            const kafkaConsumer = new RDKafka.KafkaConsumer({
                ...this._globalConfig,
                'enable.partition.eof': true
            }, {
                'consume.callback.max.messages': 100,
                'auto.commit.enable': false,
                'auto.offset.reset': 'earliest',
            });

            kafkaConsumer.connect(undefined, (error, metadata: RDKafka.Metadata) => {
                if(error) {
                    return reject(error);
                }

                this._logger?.debug("Kafka consumer connected:", metadata);
                if (partitionAndOffset) {
                    // Seek to the specified partition and offset
                    const assignments: RDKafka.Assignment[] = [{
                        topic,
                        ...partitionAndOffset
                    }];
                    kafkaConsumer.assign(assignments);

                    kafkaConsumer.consume(1, (error, messages) => {
                        if (error) {
                            return reject(error);
                        }
                        processMessages(messages);
                    });
                } else {
                    // Seek across all partitions
                    const topicPartitions = this.getAllPartitionsForTopic(topic, metadata);
                    kafkaConsumer.assign(topicPartitions.map((tp) => ({...tp, offset: 0})));

                    kafkaConsumer.consume(1, (error, messages) => {
                        if (error) {
                            return reject(error);
                        }
                        processMessages(messages);
                    });
                }
            });


        });
    }

    /**
     * Fetch all messages for a given aggregateId across a specified or all partitions.
     */
    async fetchAll(
        msgKey: string,
        topic: string,
        partitionAndOffset?:{partition:number,offset:number}
    ): Promise<IRawMessage[]> {
        return new Promise((resolve, reject) => {
            const messages: IRawMessage[] = [];


            let consumeLoop: ()=>void;

            const processMessages = (consumedMessages: RDKafka.Message[]) => {
                for (const message of consumedMessages) {
                    const parsedMessage = this.formatMessage(message);
                    if (parsedMessage.key === msgKey) {
                        messages.push(parsedMessage);
                    }
                }
                setImmediate(() => {
                    consumeLoop();
                });
            };

            const completeConsumption = () => {
                kafkaConsumer.disconnect((err, data) => {
                    resolve(messages)
                    return;
                });
            };

            const kafkaConsumer = new RDKafka.KafkaConsumer({
                ...this._globalConfig,
                'enable.partition.eof': true
            }, {
                'consume.callback.max.messages': 100,
                'auto.commit.enable': false,
                'auto.offset.reset': 'earliest',
            });

            kafkaConsumer.setDefaultConsumeTimeout(this._options.batchTimeoutMs || defaultOptions.batchTimeoutMs);

            kafkaConsumer.connect(undefined, (error, metadata:RDKafka.Metadata) => {
                if(error) {
                    return reject(error);
                }
                this._logger?.info("Kafka consumer connected:", metadata);

                if (partitionAndOffset) {
                    // Fetch messages only from the specified partition
                    kafkaConsumer.assign([{topic, ...partitionAndOffset}]);

                    kafkaConsumer.consume((error, consumedMessages) => {
                        if (error) {
                            return reject(error);
                        }
                        processMessages(consumedMessages);
                        completeConsumption();
                    });
                } else {
                    // Fetch messages from all partitions
                    const topicPartitions = this.getAllPartitionsForTopic(topic, metadata);
                    let partitionsReading = topicPartitions.length;

                   /* kafkaConsumer.on('partition.eof', (eofEvent: RDKafka.TopicPartitionOffset) => {
                        partitionsReading--;
                        if (partitionsReading === 0) {
                            completeConsumption();
                        }
                    });*/

                    kafkaConsumer.assign(
                        topicPartitions.map((tp) => ({
                            ...tp,
                            offset: 0,
                        }))
                    );

                    consumeLoop = ()=>{
                         kafkaConsumer.consume(this._batchSize, (error, consumedMessages) => {
                        //kafkaConsumer.consume((error, consumedMessages) => {
                            if (error) {
                                return reject(error);
                            }

                            if(Array.isArray(consumedMessages)) {
                                if(consumedMessages.length > 0) processMessages(consumedMessages);
                                else completeConsumption();
                            }else if(consumedMessages) {
                                processMessages([consumedMessages]);
                            }else{
                                //if(stoppedReading) return;
                                completeConsumption();
                            }
                        });
                    };
                    consumeLoop();
                }
            });


        });
    }

    /**
     * Helper: Get all partitions for a given topic.
     */
    private getAllPartitionsForTopic(topic: string, metadata: RDKafka.Metadata): RDKafka.TopicPartition[] {
        const topicMetadata = metadata.topics.find((t: RDKafka.TopicMetadata) => t.name === topic);
        if (!topicMetadata || !topicMetadata.partitions.length) {
            throw new Error(`No partitions found for topic: ${topic}`);
        }

        // Return all partitions for the topic
        return topicMetadata.partitions.map((partition: RDKafka.PartitionMetadata) => ({
                topic,
                partition: partition.id,
        }));
    }

    /**
     * Utility method to format a Kafka message into IDomainMessage.
     */
    private formatMessage(message: RDKafka.Message): IRawMessage {
        return {
            key: message.key?.toString() || null,
            value: message.value ? JSON.parse(message.value.toString()) : null,
            topic: message.topic,
            partition: message.partition,
            offset: Number(message.offset),
            timestamp: message.timestamp || null,
            headers: message.headers || null,
        };
    }

}

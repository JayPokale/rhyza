"use strict";

import {IMessageConsumer, IMessage} from "common-types-lib";
import {EventEmitter} from "events";
import {
    RafikiKafkaRawConsumer,
    RafikiKafkaRawConsumerOutputType,
    RafikiKafkaRawConsumerOptions,
} from "./raw/rdkafka_raw_consumer";
import {IRawAuthenticationOptions, IRawMessage} from "./raw/raw_types";

type RafikiKafkaJsonConsumerEvents = "rebalance";
type RafikiKafkaJsonConsumerEventListenerMap = {
    rebalance: (
        type: "assign" | "revoke",
        assignments: { topic: string; partition: number }[]
    ) => void;
};
type RafikiKafkaJsonConsumerEventListener<K extends string> =
    K extends keyof RafikiKafkaJsonConsumerEventListenerMap
        ? RafikiKafkaJsonConsumerEventListenerMap[K]
        : never;

export class RafikiKafkaJsonConsumerOptions {
    kafkaBrokerList!: string;
    kafkaGroupId?: string;
    useSyncCommit?: boolean;
    autoOffsetReset?: "earliest" | "latest" | "error"; // default is latest
    sessionTimeoutMs?: number; //Client group session and failure detection timeout, default is 45 secs
    batchSize?: number;
    batchTimeoutMs?: number;
    authentication?: IRawAuthenticationOptions;
}

export class RafikiKafkaJsonConsumer extends EventEmitter implements IMessageConsumer {
    private readonly _kafkaRawConsumer: RafikiKafkaRawConsumer;
    private _handlerCallback: ((message: IMessage) => Promise<void>) | null = null;
    private _batchHandlerCallback: ((messages: IMessage[]) => Promise<void>) | null = null;
    private _filterFn: ((message: IMessage) => boolean) | null = null;
    private _options: RafikiKafkaJsonConsumerOptions;

    constructor( options: RafikiKafkaJsonConsumerOptions ) {
        super();
        this._options = options;

        const rawOptions: RafikiKafkaRawConsumerOptions = {
            ...options,
            outputType: RafikiKafkaRawConsumerOutputType.Json,
        };

        this._kafkaRawConsumer = new RafikiKafkaRawConsumer(
            rawOptions
        );

        // if (this._options.batchSize && this._options.batchSize > 1) {
        //     this._kafkaRawConsumer.setBatchCallbackFn(this._internalBatchHandler.bind(this))
        // } else {
        //     this._kafkaRawConsumer.setCallbackFn(this._internalHandler.bind(this))
        // }

        this._kafkaRawConsumer.eventNames();

        // hook RafikiKafkaRawConsumer events we care about
        this._kafkaRawConsumer.on(
            "rebalance",
            (
                type: "assign" | "revoke",
                assignments: {
                    topic: string;
                    partition: number;
                }[]
            ) => {
                this.emit("rebalance", type, assignments);
            }
        );

        //this._logger?.isInfoEnabled() && this._logger.info("RafikiKafkaJsonConsumer - instance created")
    }

    on(
        event: RafikiKafkaJsonConsumerEvents,
        listener: RafikiKafkaJsonConsumerEventListener<RafikiKafkaJsonConsumerEvents>
    ): this {
        return super.on(event, listener);
    }

    once(
        event: RafikiKafkaJsonConsumerEvents,
        listener: RafikiKafkaJsonConsumerEventListener<RafikiKafkaJsonConsumerEvents>
    ): this {
        return super.once(event, listener);
    }

    private _convertMsg(message: IRawMessage): IMessage {
        const valueObj = message.value as IMessage;
        valueObj.msgPartition = message.partition;
        valueObj.msgOffset = message.offset;
        valueObj.msgTopic = message.topic;

        // TODO convert the headers (at least the known ones)
        return valueObj;
    }

    private async _internalHandler(rawMessage: IRawMessage): Promise<void> {
        if (!this._handlerCallback) return;

        // convert raw message to IMessage
        const msg = this._convertMsg(rawMessage);

        if (this._filterFn !== null && !this._filterFn(msg)) {
            //this._logger?.isDebugEnabled() && this._logger.debug("RafikiKafkaConsumer - ignoring message filtered out by filterFunction")
            return; // this will commit in the base
        }

        await this._handlerCallback(msg);
    }

    private async _internalBatchHandler(
        rawMessages: IRawMessage[]
    ): Promise<void> {
        if (!this._batchHandlerCallback) return;

        // convert raw message to IMessage and filter
        const msgs: IMessage[] = [];
        rawMessages.forEach((rawMsg) => {
            const msg = this._convertMsg(rawMsg);
            if (this._filterFn !== null && !this._filterFn(msg)) {
                //this._logger?.isDebugEnabled() && this._logger.debug("RafikiKafkaConsumer - ignoring message filtered out by filterFunction")
            } else {
                msgs.push(msg);
            }
        });

        await this._batchHandlerCallback(msgs);
    }

    setCallbackFn(handlerCallback: (message: IMessage) => Promise<void>): void {
        this._batchHandlerCallback = null;
        this._handlerCallback = handlerCallback;

        this._kafkaRawConsumer.setCallbackFn(this._internalHandler.bind(this));
    }

    setBatchCallbackFn(
        batchHandlerCallback: (messages: IMessage[]) => Promise<void>
    ): void {
        this._handlerCallback = null;
        this._batchHandlerCallback = batchHandlerCallback;

        this._kafkaRawConsumer.setBatchCallbackFn(
            this._internalBatchHandler.bind(this)
        );
    }

    setFilteringFn(filterFn: (message: IMessage) => boolean): void {
        this._filterFn = filterFn;
    }

    setTopics(topics: string[]): void {
        this._kafkaRawConsumer.setTopics(topics);
    }

    setBatchSize(size: number): void {
        this._kafkaRawConsumer.setBatchSize(size);
    }

    async destroy(force: boolean): Promise<void> {
        return this._kafkaRawConsumer.destroy(force);
    }

    async connect(): Promise<void> {
        return this._kafkaRawConsumer.connect();
    }

    async disconnect(): Promise<void> {
        return this._kafkaRawConsumer.disconnect();
    }

    start(): Promise<void> {
        return this._kafkaRawConsumer.start();
    }

    startAndWaitForRebalance(): Promise<void> {
        return this._kafkaRawConsumer.startAndWaitForRebalance();
    }

    async stop(): Promise<void> {
        return this._kafkaRawConsumer.stop();
    }
}

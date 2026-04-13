// import {IMessageConsumer, IMessage, IRawMessage, ILogger, IRawMessageSerializerFactory} from 'common-types-lib';
// import { EventEmitter } from 'events';
// import { RafikiKafkaRawConsumer, RafikiKafkaRawConsumerOutputType, RafikiKafkaRawConsumerOptions } from "../node-rdkafka-raw/rdkafka-raw-consumer";
// import {KafkaConsumerOptions, KafkaLowLevelConsumerOptions} from "./types";
// import {IRawAuthenticationOptions} from "../raw-types";
//
// type KafkaLowLevelWrapperConsumerEvents = 'rebalance';
// type KafkaLowLevelWrapperConsumerEventListenerMap = {
//   rebalance: (
//     type: 'assign' | 'revoke',
//     assignments: { topic: string; partition: number }[]
//   ) => void;
// };
// type KafkaLowLevelWrapperConsumerEventListener<K extends string> =
//   K extends keyof KafkaLowLevelWrapperConsumerEventListenerMap
//     ? KafkaLowLevelWrapperConsumerEventListenerMap[K]
//     : never;
//
// export class KafkaLowLevelWrapperConsumer extends EventEmitter implements IMessageConsumer{
//   private readonly _logger: ILogger | null;
//   private readonly _kafkaRawConsumer: RafikiKafkaRawConsumer;
//   private _handlerCallback: ((message: IMessage) => Promise<void>) | null = null;
//   private _batchHandlerCallback:
//     | ((messages: IMessage[]) => Promise<void>)
//     | null = null;
//   private _options: KafkaConsumerOptions;
//   private readonly _serializerFactory: IRawMessageSerializerFactory;
//
//   constructor(options: KafkaLowLevelConsumerOptions, serializerFactory: IRawMessageSerializerFactory, logger: ILogger | null = null) {
//     super();
//     this._logger = logger;
//     this._options = options;
//     this._serializerFactory = serializerFactory;
//
//     const rawOptions: RafikiKafkaRawConsumerOptions = {
//       ...options,
//       outputType: RafikiKafkaRawConsumerOutputType.Raw
//     };
//
//     this._kafkaRawConsumer = new RafikiKafkaRawConsumer(rawOptions, this._logger);
//
//     this._kafkaRawConsumer.eventNames();
//
//     // hook RafikiKafkaRawConsumer events we care about
//     this._kafkaRawConsumer.on(
//       'rebalance',
//       (
//         type: 'assign' | 'revoke',
//         assignments: {
//           topic: string;
//           partition: number;
//         }[]
//       ) => {
//         this.emit('rebalance', type, assignments);
//       }
//     );
//
//     //this._logger?.isInfoEnabled() && this._logger.info("RafikiKafkaJsonConsumer - instance created")
//   }
//
//   on(
//     event: KafkaLowLevelWrapperConsumerEvents,
//     listener: KafkaLowLevelWrapperConsumerEventListener<KafkaLowLevelWrapperConsumerEvents>
//   ): this {
//     return super.on(event, listener);
//   }
//
//   once(
//     event: KafkaLowLevelWrapperConsumerEvents,
//     listener: KafkaLowLevelWrapperConsumerEventListener<KafkaLowLevelWrapperConsumerEvents>
//   ): this {
//     return super.once(event, listener);
//   }
//
//   private _convertMsg(message: IRawMessage): IMessage {
//     const valueObj = message.value as IMessage;
//     valueObj.msgPartition = message.partition;
//     valueObj.msgOffset = message.offset;
//     valueObj.msgTopic = message.topic;
//
//     // TODO convert the headers (at least the known ones)
//     return this._serializerFactory.deserialize(message);
//   }
//
//   private async _internalBatchHandler(rawMessages: IRawMessage[]): Promise<void> {
//     if (!this._batchHandlerCallback) return;
//
//     // convert raw message to IMessage and filter
//     const msgs: IMessage[] = rawMessages.map(this._serializerFactory.deserialize.bind(this._serializerFactory));
//     await this._batchHandlerCallback(msgs);
//   }
//
//   setCallbackFn(handlerCallback: (message: IMessage) => Promise<void>): void {
//     throw new Error("Not implemented");
//   }
//
//   setBatchCallbackFn(
//     batchHandlerCallback: (messages: IMessage[]) => Promise<void>
//   ): void {
//     this._handlerCallback = null;
//     this._batchHandlerCallback = batchHandlerCallback;
//
//     this._kafkaRawConsumer.setBatchCallbackFn(
//       this._internalBatchHandler.bind(this)
//     );
//   }
//
//   setFilteringFn(filterFn: (message: IMessage) => boolean): void {
//     throw new Error("Not implemented");
//   }
//
//   setTopics(topics: string[]): void {
//     this._kafkaRawConsumer.setTopics(topics);
//   }
//
//   setBatchSize(size: number): void {
//     this._kafkaRawConsumer.setBatchSize(size);
//   }
//
//   async destroy(force: boolean): Promise<void> {
//     return this._kafkaRawConsumer.destroy(force);
//   }
//
//   async connect(): Promise<void> {
//     return this._kafkaRawConsumer.connect();
//   }
//
//   async disconnect(): Promise<void> {
//     return this._kafkaRawConsumer.disconnect();
//   }
//
//   start(): Promise<void> {
//     return this._kafkaRawConsumer.start();
//   }
//
//   startAndWaitForRebalance(): Promise<void> {
//     return this._kafkaRawConsumer.startAndWaitForRebalance();
//   }
//
//   async stop(): Promise<void> {
//     return this._kafkaRawConsumer.stop();
//   }
// }

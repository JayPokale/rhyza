import * as PlatformaticKafka from '@platformatic/kafka'

import {
  ILogger,
  IMessage,
  IMessageProducer,
  IMessageProducerAcks,
  IRawMessageSerializerFactory, ITelemetryHistogram, ITelemetryService, TELEMETRY_PROPS_CALL_NAME_PROP
} from 'common-types-lib';

import process from "process";

const HISTOGRAM_NAME = 'KafkaProducer_histo';

export class KafkaProducerNew2 implements IMessageProducer {
  private readonly _logger: ILogger;
  private readonly _producer: PlatformaticKafka.Producer;

  private readonly _serializerFactory: IRawMessageSerializerFactory;
  private readonly _telemetryService: ITelemetryService | null  = null;
  private _histogram: ITelemetryHistogram | null = null;

  constructor(
    brokers:string[],
    serializerFactory: IRawMessageSerializerFactory,
    logger: ILogger,
    telemetryService: ITelemetryService | null = null
  ) {
    this._logger = logger;
    this._telemetryService = telemetryService;
    this._serializerFactory = serializerFactory;

    this._logger.debug(`starting KafkaProducer with ${brokers.length} brokers: ${brokers}`);

    this._producer = new PlatformaticKafka.Producer({
      clientId: 'my-producer',
      bootstrapBrokers: brokers,
      /*serializers: {
        key: data => Buffer.from(data!.toString()),
        value: data => data,
        headerKey: data => Buffer.from(data!.toString()),
        headerValue: data => Buffer.from(data!.toString())
      }*/
    });

    if(this._telemetryService) {
      this._histogram = this._telemetryService.getHistogram(
        HISTOGRAM_NAME
      );
    }
  }


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendWithoutAcks(message: IMessage | IMessage[]): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async send(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]> {
    const startTs = process.hrtime.bigint();
    //const topicMessages = this._convertIMessageArrayToTopicMessages(message);

    if(!Array.isArray(message)) message = [message];

    const messagesToSend:PlatformaticKafka.MessageToProduce[] = message.map((msg)=>{
      const rawMsg = this._serializerFactory.serialize(msg);
      const platMsg:PlatformaticKafka.MessageToProduce = {
        topic: rawMsg.topic,
        partition: rawMsg.partition || undefined,
        timestamp: rawMsg.timestamp ? BigInt(rawMsg.timestamp) : undefined,
        key: Buffer.from((rawMsg.key || '').toString()),
        value: rawMsg.value as Buffer,
      }

      if(rawMsg.headers){
        platMsg.headers = new Map();
        for (const header of rawMsg.headers) {
          for (const k of Object.keys(header)) {
            if(header[k]){
              platMsg.headers.set(Buffer.from(k), Buffer.from(header[k]));
            }
          }
        }
      }
      return platMsg;
    });

    const convertTookNs = Number(process.hrtime.bigint() - startTs);

    const resIMessageProducerSendAcks: IMessageProducerAcks[] = [];


    try{
      const result: PlatformaticKafka.ProduceResult = await this._producer.send({
        idempotent: true,
        messages: messagesToSend
      });
      if(result.offsets){
        // resIMessageProducerSendAcks = result.offsets.map(
        //   (item) => {
        //     const sentTopicMsg = messagesToSend.find(
        //       (tm) => tm.topic === item.topic
        //     );
        //
        //     return {
        //       topic: item.topic,
        //       partition: item.partition,
        //       lastMsgOffset:
        //         Number(item.offset) +
        //         (sentTopicMsg ? sentTopicMsg.messages.length : 0)
        //     };
        //   }
        // );
      }
    }catch (error) {
      // @ts-expect-error
      if (PlatformaticKafka.GenericError.isGenericError(error)) {
        this._logger.error(error.code)     // 'PLT_KFK_*' string code
        console.log(error.canRetry) // boolean
      }
      if (error instanceof PlatformaticKafka.ProtocolError) {
        console.log(error.apiId)    // e.g. 'UNKNOWN_TOPIC_OR_PARTITION'
        console.log(error.apiCode)  // e.g. 'UNKNOWN_TOPIC_OR_PARTITION'
      }
      //@ts-expect-error
      if (PlatformaticKafka.MultipleErrors.isMultipleErrors(error)) {
        // AggregateError - iterate error.errors
        for (const inner of error.errors) {
          console.log(inner.code)
        }
      }
    }







    if(this._histogram) {
      this._histogram.observe(Number(process.hrtime.bigint()-startTs), {[TELEMETRY_PROPS_CALL_NAME_PROP]:'send'});
      this._histogram.observe(convertTookNs, {[TELEMETRY_PROPS_CALL_NAME_PROP]:'send_convert'});
    }

    return resIMessageProducerSendAcks;
  }

  async destroy(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - destroy called...`);
    return await this.disconnect();
  }

  async connect(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - connect called...`);
    const resp = await this._producer.connectToBrokers();
    console.log(resp)

    console.log(`Is connected to producer: ${this._producer.isConnected()}`);
  }

  async disconnect(): Promise<void> {
    this._logger?.info(`${this.constructor.name} - disconnect called...`);
    // automatically flushes
    await this._producer.close();
  }
}

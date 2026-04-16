import {KafkaJS, RdKafka} from "@confluentinc/kafka-javascript";
import {IRawMessage} from "common-types-lib";


export class KafkaUtil {
  static convertFromKafkaMsg(kafkaMsg: RdKafka.Message | KafkaJS.KafkaMessage, topic: string, partition: number): IRawMessage{
    let retMsg:IRawMessage;
    if (kafkaMsg.hasOwnProperty('topic') && kafkaMsg.hasOwnProperty('partition') && kafkaMsg.hasOwnProperty('offset')) {
      const srcMsg = kafkaMsg as RdKafka.Message;
      retMsg = {
        topic: srcMsg.topic,
        partition: srcMsg.partition,
        offset: srcMsg.offset,
        key: srcMsg.key ? srcMsg.key.toString() : null,
        timestamp: srcMsg.timestamp ?? null,
        value: srcMsg.value || null,
        headers: null
      }
      // parse msg headers
      if (srcMsg.headers != null) {
        retMsg.headers = [];
        srcMsg.headers.forEach((kafkaHeader: RdKafka.MessageHeader) => {
          // NOTE: kafka headers are key/value pairs, only one pair will ever exist per header rec
          for (const key in kafkaHeader) {
            if (!Object.prototype.hasOwnProperty.call(kafkaHeader, key)) continue;
            retMsg.headers!.push({[key]: kafkaHeader[key].toString()});
          }
        });
      }
    } else {
      const srcMsg = kafkaMsg as KafkaJS.KafkaMessage;
      retMsg = {
        topic: topic,
        partition: partition,
        offset: Number(srcMsg.offset),
        key: srcMsg.key ? srcMsg.key.toString() : null,
        timestamp: Number(srcMsg.timestamp),
        value: srcMsg.value || null,
        headers: null
      }
      // parse headers
      if (srcMsg.headers != null && Object.keys(srcMsg.headers).length > 0) {
        retMsg.headers = [];
        for (const k of Object.keys(srcMsg.headers)) {
          if (srcMsg.headers[k] != null) {
            retMsg.headers.push({[k]: srcMsg.headers[k].toString()});
          }
        }
      }
    }

    return retMsg;
  }


  static convertToKafkaMsg(rawMessage: IRawMessage): KafkaJS.Message{
    const outpuMsg: KafkaJS.Message = {
      key: rawMessage.key,
      timestamp: rawMessage.timestamp ? rawMessage.timestamp.toString() : undefined,
      partition: rawMessage.partition || undefined,
      value: rawMessage.value as Buffer<ArrayBufferLike>,
      headers: undefined
    }

    if(rawMessage.headers){
      outpuMsg.headers = {};
      for(const header of rawMessage.headers){
        for(const k of Object.keys(header)){
          outpuMsg.headers![k] = header[k];
        }
      }
    }

    return outpuMsg;
  }
}

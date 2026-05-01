import { CommandMsg, IMessage, MessageTypes } from 'common-types-lib';
import { JsonBaseMessageSerializer } from './json-base-msg-serializer';

export class JsonCommandSerializer extends JsonBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.COMMAND;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _deserializeSpecific(inputObj: any, outputMsg: IMessage): void {
    (outputMsg as CommandMsg).aggregateId = inputObj.aggregateId;
    (outputMsg as CommandMsg).msgBatchId = inputObj.msgBatchId;
  }
}

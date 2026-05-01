import { IMessage, MessageTypes, StateEvent } from 'common-types-lib';
import { JsonBaseMessageSerializer } from './json-base-msg-serializer';

export class JsonStateEventSerializer extends JsonBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.STATE_EVENT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected _deserializeSpecific(inputObj: any, outputMsg: IMessage): void {
    (outputMsg as StateEvent).aggregateId = inputObj.aggregateId;
    (outputMsg as StateEvent).aggregateVersion = inputObj.aggregateVersion;
  }
}

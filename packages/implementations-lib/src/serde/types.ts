import { IMessage, MessageDataFormats } from 'common-types-lib';

export const MSG_HEADER_MSG_DATA_FORMAT = 'msgDataFormat';
export const MSG_HEADER_MSG_TYPE = 'msgType';
export const MSG_HEADER_MSG_NAME = 'msgName';

export interface IRawMessageSerializer {
  readonly dataFormat: MessageDataFormats;
  readonly msgType: string;

  // required for non-JSON formats which must know the message name before deserialization
  readonly msgName?: string;
  serializeMsg(msg: IMessage): Uint8Array;
  deserializeMsg(data: Uint8Array): IMessage;
}

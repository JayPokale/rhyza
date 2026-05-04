// package:
// file: messaging.proto

/* tslint:disable */
/* eslint-disable */

import * as jspb from 'google-protobuf';
import * as google_protobuf_any_pb from 'google-protobuf/google/protobuf/any_pb';

export class PbKafkaMessage extends jspb.Message {
  getMsgType(): PbKafkaMessageTypes;
  setMsgType(value: PbKafkaMessageTypes): PbKafkaMessage;
  getMsgId(): string;
  setMsgId(value: string): PbKafkaMessage;
  getMsgName(): string;
  setMsgName(value: string): PbKafkaMessage;
  getMsgTimestamp(): number;
  setMsgTimestamp(value: number): PbKafkaMessage;

  hasAggregateId(): boolean;
  clearAggregateId(): void;
  getAggregateId(): string | undefined;
  setAggregateId(value: string): PbKafkaMessage;

  hasAggregateVersion(): boolean;
  clearAggregateVersion(): void;
  getAggregateVersion(): string | undefined;
  setAggregateVersion(value: string): PbKafkaMessage;

  hasPayload(): boolean;
  clearPayload(): void;
  getPayload(): google_protobuf_any_pb.Any | undefined;
  setPayload(value?: google_protobuf_any_pb.Any): PbKafkaMessage;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PbKafkaMessage.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: PbKafkaMessage
  ): PbKafkaMessage.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: PbKafkaMessage,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): PbKafkaMessage;
  static deserializeBinaryFromReader(
    message: PbKafkaMessage,
    reader: jspb.BinaryReader
  ): PbKafkaMessage;
}

export namespace PbKafkaMessage {
  export type AsObject = {
    msgType: PbKafkaMessageTypes;
    msgId: string;
    msgName: string;
    msgTimestamp: number;
    aggregateId?: string;
    aggregateVersion?: string;
    payload?: google_protobuf_any_pb.Any.AsObject;
  };
}

export class PbStateEvent extends jspb.Message {
  getMsgtype(): PbKafkaMessageTypes;
  setMsgtype(value: PbKafkaMessageTypes): PbStateEvent;
  getMsgId(): string;
  setMsgId(value: string): PbStateEvent;
  getMsgName(): string;
  setMsgName(value: string): PbStateEvent;
  getMsgTimestamp(): number;
  setMsgTimestamp(value: number): PbStateEvent;
  getAggregateId(): string;
  setAggregateId(value: string): PbStateEvent;
  getAggregateVersion(): string;
  setAggregateVersion(value: string): PbStateEvent;

  hasPayload(): boolean;
  clearPayload(): void;
  getPayload(): google_protobuf_any_pb.Any | undefined;
  setPayload(value?: google_protobuf_any_pb.Any): PbStateEvent;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PbStateEvent.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: PbStateEvent
  ): PbStateEvent.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: PbStateEvent,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): PbStateEvent;
  static deserializeBinaryFromReader(
    message: PbStateEvent,
    reader: jspb.BinaryReader
  ): PbStateEvent;
}

export namespace PbStateEvent {
  export type AsObject = {
    msgtype: PbKafkaMessageTypes;
    msgId: string;
    msgName: string;
    msgTimestamp: number;
    aggregateId: string;
    aggregateVersion: string;
    payload?: google_protobuf_any_pb.Any.AsObject;
  };
}

export class PbSnapshotEvent extends jspb.Message {
  getMsgtype(): PbKafkaMessageTypes;
  setMsgtype(value: PbKafkaMessageTypes): PbSnapshotEvent;
  getMsgId(): string;
  setMsgId(value: string): PbSnapshotEvent;
  getMsgName(): string;
  setMsgName(value: string): PbSnapshotEvent;
  getMsgTimestamp(): number;
  setMsgTimestamp(value: number): PbSnapshotEvent;
  getAggregateId(): string;
  setAggregateId(value: string): PbSnapshotEvent;
  getAggregateVersion(): string;
  setAggregateVersion(value: string): PbSnapshotEvent;
  getLastEventIndexPartition(): number;
  setLastEventIndexPartition(value: number): PbSnapshotEvent;
  getLastEventIndexOffset(): number;
  setLastEventIndexOffset(value: number): PbSnapshotEvent;

  hasPayload(): boolean;
  clearPayload(): void;
  getPayload(): google_protobuf_any_pb.Any | undefined;
  setPayload(value?: google_protobuf_any_pb.Any): PbSnapshotEvent;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PbSnapshotEvent.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: PbSnapshotEvent
  ): PbSnapshotEvent.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: PbSnapshotEvent,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): PbSnapshotEvent;
  static deserializeBinaryFromReader(
    message: PbSnapshotEvent,
    reader: jspb.BinaryReader
  ): PbSnapshotEvent;
}

export namespace PbSnapshotEvent {
  export type AsObject = {
    msgtype: PbKafkaMessageTypes;
    msgId: string;
    msgName: string;
    msgTimestamp: number;
    aggregateId: string;
    aggregateVersion: string;
    lastEventIndexPartition: number;
    lastEventIndexOffset: number;
    payload?: google_protobuf_any_pb.Any.AsObject;
  };
}

export class PbCommandMsg extends jspb.Message {
  getMsgtype(): PbKafkaMessageTypes;
  setMsgtype(value: PbKafkaMessageTypes): PbCommandMsg;
  getMsgId(): string;
  setMsgId(value: string): PbCommandMsg;
  getMsgName(): string;
  setMsgName(value: string): PbCommandMsg;
  getMsgTimestamp(): number;
  setMsgTimestamp(value: number): PbCommandMsg;
  getAggregateId(): string;
  setAggregateId(value: string): PbCommandMsg;
  getRequestId(): string;
  setRequestId(value: string): PbCommandMsg;

  hasPayload(): boolean;
  clearPayload(): void;
  getPayload(): google_protobuf_any_pb.Any | undefined;
  setPayload(value?: google_protobuf_any_pb.Any): PbCommandMsg;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PbCommandMsg.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: PbCommandMsg
  ): PbCommandMsg.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: PbCommandMsg,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): PbCommandMsg;
  static deserializeBinaryFromReader(
    message: PbCommandMsg,
    reader: jspb.BinaryReader
  ): PbCommandMsg;
}

export namespace PbCommandMsg {
  export type AsObject = {
    msgtype: PbKafkaMessageTypes;
    msgId: string;
    msgName: string;
    msgTimestamp: number;
    aggregateId: string;
    requestId: string;
    payload?: google_protobuf_any_pb.Any.AsObject;
  };
}

export enum PbKafkaMessageTypes {
  STATE_EVENT = 0,
  SNAPSHOT_EVENT = 1,
  DOMAIN_EVENT = 2,
  COMMAND = 3
}

'use strict'

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Crypto from 'crypto'

export const MessageTypes = {
  STATE_EVENT: 'STATE_EVENT', // for private event-sourcing events
  STATE_SNAPSHOT: 'STATE_SNAPSHOT', // for private event-sourcing snapshot events
  DOMAIN_EVENT: 'DOMAIN_EVENT', // public domain events
  COMMAND: 'COMMAND' // for internal/private BC command
} as const
export type MessageTypes = keyof typeof MessageTypes

export const MessageInboundProtocol = {
  JSON: 'JSON',
  GRPC_SYNC: 'GRPC_SYNC'
} as const
export type MessageInboundProtocol = keyof typeof MessageInboundProtocol

export interface IMessage {
  msgType: MessageTypes
  msgName: string // name of the event or command
  msgId: string // unique per message
  msgTimestamp: number
  msgTopic: string
  msgKey: string | null // usually the id of the aggregate (used for partitioning)
  msgPartition: number | null
  msgOffset: number | null

  payload: any

  inboundProtocolType: MessageInboundProtocol // inbound/initial request protocol
  inboundProtocolOpaqueState: any // protocol opaque state  - all messages produced as response to this should copy it if present
  tracingInfo?: any // optional tracing information, should be propagated between calls
  requestId?: string
}

export interface IDomainMessage extends IMessage {
  contextName: string // name of the source/target BC (source if event, target if command)
  aggregateId: string // id of the source/target aggregate (source if event, target if command)
}

export abstract class DomainMsg implements IDomainMessage {
  msgId: string = Crypto.randomUUID()
  msgTimestamp: number = Date.now()
  msgPartition: number | null = null
  msgOffset: number | null = null

  msgName: string = (this as any).constructor.name

  abstract msgType: MessageTypes
  abstract msgKey: string
  abstract msgTopic: string

  abstract aggregateId: string
  abstract contextName: string
  //abstract msgName: string;

  abstract payload: any

  abstract inboundProtocolType: MessageInboundProtocol
  abstract inboundProtocolOpaqueState: any
  abstract tracingInfo?: any

  //TODO abstract validatePayload(): void

  // static fromIDomainMessage(msg: IDomainMessage): DomainMsg | undefined {
  //     const obj: DomainMsg = Reflect.construct(this, [{}])
  //
  //     Object.assign(obj, msg)
  //
  //     obj.validatePayload()
  //
  //     return obj
  // }
}

export abstract class StateEventMsg extends DomainMsg {
  msgType: MessageTypes = MessageTypes.STATE_EVENT

  inboundProtocolType: MessageInboundProtocol = MessageInboundProtocol.JSON
  inboundProtocolOpaqueState: any = null
  tracingInfo: any = undefined

  //TODO abstract validatePayload(): void
}

export abstract class DomainEventMsg extends DomainMsg {
  msgType: MessageTypes = MessageTypes.DOMAIN_EVENT

  inboundProtocolType: MessageInboundProtocol = MessageInboundProtocol.JSON
  inboundProtocolOpaqueState: any = null
  tracingInfo: any = undefined

  isErrorEvent: boolean = false
  sourceMessageName?: string = undefined

  requestId?: string

  //TODO abstract validatePayload(): void
}

export abstract class CommandMsg extends DomainMsg {
  msgType: MessageTypes = MessageTypes.COMMAND

  inboundProtocolType: MessageInboundProtocol = MessageInboundProtocol.JSON
  inboundProtocolOpaqueState: any = null
  tracingInfo: any = undefined

  //TODO abstract validatePayload(): void
  requestId?: string

  public setRequestId(requestId: string) {
    this.requestId = requestId
  }
}

// export abstract class StateSnapshotMsg extends DomainMsg {
//     msgType: MessageTypes = MessageTypes.STATE_SNAPSHOT
//     lastEventOffset: number                     // offset of the last event that was considered for the snapshot
//     eventsPartition: number                     // partition from the events
// }

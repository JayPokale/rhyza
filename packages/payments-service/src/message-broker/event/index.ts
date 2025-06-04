import { DomainEventMsg } from "../message";
import { IncomingPayment, OutgoingPayment, Quote } from "../../payment";
import { Amount } from "../../shared";

/**
 * Enumeration representing various topics used in the system.
 *
 * This enum provides a set of predefined constants that represent specific
 * topics utilized for communication, event handling, or other system-level
 * categorization.
 *
 * Enum Members:
 * - ApiResponseEvents: Represents topics related to API response events.
 */
export enum Topic {
  "ApiResponseEvents" = "api-response-events",
  "OutgoingPaymentCreated" = "outgoing-payment-created",
  "OutgoingPaymentFunded" = "outgoing-payment-funded",
}

export interface ApiRspEventPayload {
  createdId: any;
}

export class ApiRspIncomingPaymentEvent extends DomainEventMsg {
  contextName: string = "api-response-incoming-payment";
  aggregateId: string;
  aggregateName: string = "api-response-incoming-payment";
  msgKey: string;
  msgTopic: string = Topic.ApiResponseEvents;
  payload: ApiRspEventPayload;

  constructor(payload: ApiRspEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export class ApiRspQuoteEvent extends DomainEventMsg {
  contextName: string = "api-response-quote";
  aggregateId: string;
  aggregateName: string = "api-response-quote";
  msgKey: string;
  msgTopic: string = Topic.ApiResponseEvents;
  payload: ApiRspEventPayload;

  constructor(payload: ApiRspEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export class ApiRspOutgoingPaymentEvent extends DomainEventMsg {
  contextName: string = "api-response-outgoing-payment";
  aggregateId: string;
  aggregateName: string = "api-response-outgoing-payment";
  msgKey: string;
  msgTopic: string = Topic.ApiResponseEvents;
  payload: ApiRspEventPayload;

  constructor(payload: ApiRspEventPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface ApiRspErrorPayload {
  isCmdErrorResponse: boolean;
  errorType: string;
  error: string;
  stack?: string;
  message: string;
  name: string;
  requestId: string;
}

export class ApiRspErrorEvent extends DomainEventMsg {
  contextName: string = "api-response-error";
  aggregateId: string;
  aggregateName: string = "api-response-error";
  msgKey: string;
  msgTopic: string = Topic.ApiResponseEvents;
  payload: ApiRspErrorPayload;

  constructor(payload: ApiRspErrorPayload, requestId: string) {
    super();
    this.aggregateId = this.msgKey = requestId;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalOutgoingPaymentCreatedPayload {
  quote: Quote;
  outgoingPayment: OutgoingPayment;
  incomingPayment: IncomingPayment;
  senderWalletAddressId: string;
  receiveAmount: Amount;
  debitAmount: Amount;
}

export class LocalOutgoingPaymentCreatedEvent extends DomainEventMsg {
  contextName: string = "outgoing-payment-created";
  aggregateId: string;
  aggregateName: string = "outgoing-payment-created";
  msgKey: string;
  msgTopic: string = Topic.OutgoingPaymentCreated;
  payload: LocalOutgoingPaymentCreatedPayload;

  constructor(payload: LocalOutgoingPaymentCreatedPayload, requestId: string) {
    super();
    this.msgKey = this.aggregateId = payload.incomingPayment.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

export interface LocalOutgoingPaymentFundedPayload {
  outgoingPayment: OutgoingPayment;
  incomingPayment: IncomingPayment;
  senderWalletAddressId: string;
  receiveAmount: Amount;
  debitAmount: Amount;
}

export class LocalOutgoingPaymentFundedEvent extends DomainEventMsg {
  contextName: string = "outgoing-payment-funded";
  aggregateId: string;
  aggregateName: string = "outgoing-payment-funded";
  msgKey: string;
  msgTopic: string = Topic.OutgoingPaymentCreated;
  payload: LocalOutgoingPaymentFundedPayload;

  constructor(payload: LocalOutgoingPaymentFundedPayload, requestId: string) {
    super();
    this.msgKey = this.aggregateId = payload.incomingPayment.id;
    this.payload = payload;
    this.requestId = requestId;
  }
}

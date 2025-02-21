"use strict"

import {CommandMsg} from "../message"
import {CreateIncomingPaymentRequest, CreateQuoteRequest} from "../../payment"

export enum Topic {
  "Commands" = "rafiki-commands"
}

export class CreateIncomingPaymentCmd extends CommandMsg {
  contextName: string = 'payment'
  aggregateId: string
  aggregateName: string = 'payments'
  msgKey: string
  msgTopic: string = 'incoming-payment-commands'
  payload: CreateIncomingPaymentRequest

  constructor(payload: CreateIncomingPaymentRequest) {
    super()
    this.aggregateId = this.msgKey = `${payload.id}`
    this.payload = payload
  }

  validatePayload(): void {
    // TODO @jason complete...
  }
}

export class CreateQuoteCmd extends CommandMsg {
  contextName: string = 'payment'
  aggregateId: string
  aggregateName: string = 'payments'
  msgKey: string
  msgTopic: string = 'quote-commands'
  payload: CreateQuoteRequest

  constructor(payload: CreateQuoteRequest) {
    super()
    this.aggregateId = this.msgKey = `${payload.id}`
    this.payload = payload
  }

  validatePayload(): void {
    // TODO @jason complete...
  }
}
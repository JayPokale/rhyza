'use strict'

import {
  Amount,
  Asset,
  ITelemetryService,
  WalletAddress
} from 'common-types-lib'
import { IlpDetails } from '../ilp-connector'

export type CreateIncomingPaymentRequest = {
  id?: string
  walletAddressId: string // we can consider using URIs here: might be easier for integrators to deal with + gives us flexibility particularly when it comes to paying into incoming payments on remote Rafikis
  expiresAt?: Date
  incomingAmount?: Amount
}

export type Quote = {
  id: string
  receiveAmount: Amount
  debitAmount: Amount
  senderWalletAddressId: string
  incomingPaymentId: string
  expiresAt: Date
  exchangeRate: number
}

export const OutgoingPaymentState = {
  CREATED: 'CREATED', // normal state, can add new entries
  FUNDED: 'FUNDED', // normal state, can add new entries
  COMPLETED: 'COMPLETED' // not available to reads or writes, historic only (can be changed back to inactive)
} as const
export type OutgoingPaymentState = keyof typeof OutgoingPaymentState

// Before starting ILP payment
// reserve funds: settlement account -> wallet address
// reserve funds: asset liquidity -> "pending payments account"

export type MicroPayment = {
  method: 'LOCAL' | 'ILP'
  ilpPeerId?: string
  requestId: string
  amount: bigint
}

export type OutgoingPayment = {
  id: string
  quoteId?: string
  asset: Asset
  state: OutgoingPaymentState
  sentAmount: bigint
  debitAmount: bigint
  localIncomingPaymentId?: string
  remoteIncomingPaymentUrl?: string
  senderWalletAddressId: string
}

export type OutgoingPaymentWithMicroPayments = OutgoingPayment & {
  microPayments: MicroPayment[]
}

export type IncomingPaymentWithNewMicroPaymentUpdate = {
  microPayment: MicroPayment
  state?: LocalIncomingPaymentState
  receivedAmount: bigint
}

export type OutgoingPaymentWithNewMicroPaymentUpdate = {
  microPayment: MicroPayment
  state?: OutgoingPaymentState
  sentAmount: bigint
}

export const LocalIncomingPaymentState = {
  CREATED: 'CREATED', // normal state, can add new micropayments
  EXPIRED: 'EXPIRED', // available for reads only, cannot add new entries
  COMPLETED: 'COMPLETED' // not available to reads or writes, historic only (can be changed back to inactive)
} as const
export type LocalIncomingPaymentState = keyof typeof LocalIncomingPaymentState

interface BaseIncomingPayment {
  expiresAt: Date
  asset: Asset
  incomingAmount?: bigint
  receivedAmount: bigint
}

export interface IncomingPayment extends BaseIncomingPayment {
  id: string
  state: LocalIncomingPaymentState
  walletAddressId: string
  type: 'LOCAL'
}

export type IncomingPaymentWithMicroPayments = IncomingPayment & {
  microPayments: MicroPayment[]
}

export interface CreateQuoteRequest {
  id?: string
  senderWalletAddressId: string
  incomingPaymentId: string
  debitAmount?: Amount
  receiveAmount?: Amount
}

export interface CreateOutgoingPaymentFromQuoteRequest {
  id?: string
  quoteId: string
  senderWalletAddressId: string
  // isFunded: boolean; TODO if the outgoing payment request came from a third party we need to webhook out to the ASE to "fund" the payment
}

export interface CreateOutgoingPaymentFromIncomingPaymentRequest {
  id?: string
  incomingPaymentId: string
  senderWalletAddressId: string
  debitAmount: Amount
}

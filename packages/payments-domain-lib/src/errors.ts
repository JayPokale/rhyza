/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

export class DuplicateWalletAddressFoundError extends Error {}

export class WalletAddressNotFoundError extends Error {}

export class WalletAddressInactiveError extends Error {}

export class IncomingPaymentWalletAddressAssetMismatchError extends Error {}

export class IncomingPaymentNotFoundError extends Error {}

export class IncomingPaymentInvalidStateError extends Error {}

export class InvalidIncomingPaymentExpiryError extends Error {}

export class DuplicateIncomingPaymentFoundError extends Error {}

export class InvalidAmountError extends Error {}

export class CouldNotConvertExchangeRatesError extends Error {}

export class DuplicateQuoteFoundError extends Error {}

export class QuoteNotFoundError extends Error {}

export class PeerNotFoundError extends Error {}

export class QuoteExpiredError extends Error {}

export class IncomingPaymentCannotReceiveMicroPayment extends Error {}

export class DuplicateOutgoingPaymentFoundError extends Error {}

export class OutgoingPaymentMissingIdentifierError extends Error {}

export class OutgoingPaymentNotFoundError extends Error {}

export class OutgoingPaymentInvalidStateError extends Error {}

export class InvalidIdLengthError extends Error {}

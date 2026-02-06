'use strict'

import {
  Amount,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent,
  Attributes,
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentCmd,
  CreateQuoteCmd,
  ILocalEventProducerAdapter,
  ILogger,
  IMessage,
  ITelemetryService,
  LocalEvent,
  WalletAddress
} from 'common-types-lib'
import { IIlpPeerService } from '../ilp-peer'
import { IRatesServiceAdapter } from '../rates'
import { ILiquidityService } from '../liquidity'
import {
  IRemoteIncomingPaymentService,
  RemoteIncomingPayment
} from '../remote-incoming-payment'
import { IWalletAddressRepository, IWalletAddressService } from '../wallets'
import {
  IIncomingPaymentRepository,
  IOutgoingPaymentRepository,
  IQuoteRepository
} from './payment-ports'

import {
  CreateOutgoingPaymentFromIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  IncomingPayment,
  IncomingPaymentWithNewMicroPaymentUpdate,
  LocalIncomingPaymentState,
  MicroPayment,
  OutgoingPayment,
  OutgoingPaymentState,
  OutgoingPaymentWithNewMicroPaymentUpdate,
  Quote
} from './payment-types'
import {
  CouldNotConvertExchangeRatesError,
  DuplicateIncomingPaymentFoundError,
  DuplicateOutgoingPaymentFoundError,
  DuplicateQuoteFoundError,
  IncomingPaymentCannotReceiveMicroPayment,
  IncomingPaymentInvalidStateError,
  IncomingPaymentNotFoundError,
  IncomingPaymentWalletAddressAssetMismatchError,
  InvalidAmountError,
  InvalidIdLengthError,
  InvalidIncomingPaymentExpiryError,
  OutgoingPaymentInvalidStateError,
  OutgoingPaymentMissingIdentifierError,
  OutgoingPaymentNotFoundError,
  PeerNotFoundError,
  QuoteExpiredError,
  QuoteNotFoundError,
  WalletAddressInactiveError,
  WalletAddressNotFoundError
} from '../errors'
import {
  IlpPaymentFulfillPacketReceivedEvent,
  IlpPaymentPreparePacketAcceptedEvent,
  IlpPaymentPreparePacketReceivedEvent,
  IlpQuotePacketReceivedEvent,
  IncomingPaymentCompletedEvent,
  LocalOutgoingPaymentFundedEvent,
  OutgoingPaymentCompletedEvent,
  PaymentEventType,
  RemoteOutgoingPaymentFundedEvent,
  RemoteQuoteRequestedEvent
} from './payment-events'
import {
  LiquidityRequest,
  PeerToWalletAddressLiquidityRequest,
  WalletAddressDepositLiquidityRequest,
  WalletAddressToPeerLiquidityRequest,
  WalletToWalletAddressLiquidityRequest
} from 'liquidity-types-lib'

const INCOMING_PAYMENT_MAX_EXPIRY_MS = 2592000000 // 30 days
const INCOMING_PAYMENT_DEFAULT_EXPIRY = 1000 * 60 * 10
const QUOTE_EXPIRY_MS = 1000 * 60 * 10

const TELEMETRY_API_HISTOGRAM_NAME = 'payments_domain'

export class PaymentDomainService {
  private readonly _logger: ILogger
  //private readonly _walletAddressService: IWalletAddressService;
  private readonly _walletAddressRepository: IWalletAddressRepository
  private readonly _ilpPeerService: IIlpPeerService
  private readonly _ratesService: IRatesServiceAdapter
  private readonly _liquidityService: ILiquidityService
  private readonly _remoteIncomingPaymentService: IRemoteIncomingPaymentService
  private readonly _incomingPaymentRepository: IIncomingPaymentRepository
  private readonly _outgoingPaymentRepository: IOutgoingPaymentRepository
  private readonly _quoteRepository: IQuoteRepository
  private readonly _paymentEventProducer: ILocalEventProducerAdapter
  private readonly _telemetryService: ITelemetryService

  constructor(
    // walletAddressService: IWalletAddressService,
    walletAddressRepository: IWalletAddressRepository,
    ilpPeerService: IIlpPeerService,
    ratesService: IRatesServiceAdapter,
    liquidityService: ILiquidityService,
    remoteIncomingPaymentService: IRemoteIncomingPaymentService,
    incomingPaymentRepository: IIncomingPaymentRepository,
    outgoingPaymentRepository: IOutgoingPaymentRepository,
    quoteRepository: IQuoteRepository,
    paymentEventProducer: ILocalEventProducerAdapter,
    telemetryService: ITelemetryService,
    logger: ILogger
  ) {
    this._telemetryService = telemetryService
    this._paymentEventProducer = paymentEventProducer
    this._quoteRepository = quoteRepository
    this._outgoingPaymentRepository = outgoingPaymentRepository
    this._incomingPaymentRepository = incomingPaymentRepository
    this._remoteIncomingPaymentService = remoteIncomingPaymentService
    this._liquidityService = liquidityService
    this._ratesService = ratesService
    this._ilpPeerService = ilpPeerService
    // this._walletAddressService = walletAddressService;
    this._walletAddressRepository = walletAddressRepository
    this._logger = logger
  }

  private _startTimer(
    callname: string
  ): (additionalAttributes?: Attributes) => void {
    return this._telemetryService.startTimer(TELEMETRY_API_HISTOGRAM_NAME, {
      callName: callname
    })
  }

  private _outputEvents: IMessage[] = []

  private _preFetchedWalletAddress: WalletAddress[] = []
  private _preFetchedIncomingPayments: IncomingPayment[] = []
  private _preFetchedQuotes: Quote[] = []
  private _preFetchedOutgoingPayments: OutgoingPayment[] = []

  private _newIncomingPayments: IncomingPayment[] = []
  private _newQuotes: Quote[] = []
  private _newOutgoingPayments: OutgoingPayment[] = []

  private _newIncomingMicroPayments: {
    incomingPaymentId: string
    microPayment: MicroPayment
  }[] = []
  private _newOutgoingMicroPayments: {
    outgoingPaymentId: string
    microPayment: MicroPayment
  }[] = []

  private _newIncomingPaymentUpdates: {
    incomingPaymentId: string
    newReceivedAmount: bigint
    newState?: LocalIncomingPaymentState
  }[] = []

  private _newLiquidityRequests: LiquidityRequest[] = []

  async _msgHandlerBatch(cmds: IMessage[]): Promise<IMessage[]> {
    const stopTimer = this._startTimer('DomainMsgHandlerBatch')

    this._logger.debug('- _msgHandlerBatch() started')
    // cleanup before starting
    this._outputEvents = []
    this._newLiquidityRequests = []
    this._preFetchedWalletAddress = []
    this._preFetchedIncomingPayments = []
    this._preFetchedQuotes = []
    this._preFetchedOutgoingPayments = []

    this._newIncomingPayments = []
    this._newQuotes = []
    this._newOutgoingPayments = []
    this._newIncomingMicroPayments = []
    this._newOutgoingMicroPayments = []
    this._newIncomingPaymentUpdates = []

    // first phase, get everything from repos
    const stopPrefetchPhaseTimer = this._startTimer('PreFetchPhase')
    await this._preFetchPhase(cmds)
    stopPrefetchPhaseTimer()

    // second phase, process all business rules
    this._logger.debug('- business rules() started')
    for (const cmd of cmds) {
      if (cmd.msgTimestamp) {
        const msgDelay = Date.now() - cmd.msgTimestamp
        this._telemetryService.recordHistogram(
          TELEMETRY_API_HISTOGRAM_NAME,
          msgDelay,
          { callName: 'msgDelay' }
        )
      }

      try {
        if (cmd.msgName === CreateIncomingPaymentCmd.name) {
          const id = await this._createIncomingPayment(
            cmd as CreateIncomingPaymentCmd
          )
          this._outputEvents.push(
            new ApiRspIncomingPaymentEvent(
              { createdId: id },
              cmd.requestId || ''
            ) // TODO remove "" and change to proper domain event IncomingPaymentCreated
          )
        } else if (cmd.msgName === CreateQuoteCmd.name) {
          const id = await this._createQuote(cmd as CreateQuoteCmd)
          this._outputEvents.push(
            new ApiRspQuoteEvent({ createdId: id }, cmd.requestId || '') // TODO remove "" and change to proper domain event QuoteCreated
          )
        } else if (cmd.msgName === CreateOutgoingPaymentCmd.name) {
          const id = await this._createOutgoingPayment(
            cmd as CreateOutgoingPaymentCmd
          )
          this._outputEvents.push(
            new ApiRspOutgoingPaymentEvent(
              { createdId: id },
              cmd.requestId || ''
            ) // TODO remove "" and change to proper domain event OutgoingPaymentCreated
          )
        } else {
          this._logger.warn(
            `${this.constructor.name} - unknown command - msgName: ${cmd.msgName} msgKey: ${cmd.msgKey} msgId: ${cmd.msgId}`
          )
        }
      } catch (e) {
        this._logger.error(
          e,
          `${this.constructor.name} - error processing cmd - msgName: ${cmd.msgName} msgKey: ${cmd.msgKey} msgId: ${cmd.msgId}`
        )
      }
    }
    this._logger.debug('+ business rules() completed')

    // third phase, execute liquidity requests
    if (this._newLiquidityRequests.length > 0) {
      this._logger.debug('- _liquidityService() started')
      const stopLiqTimer = this._startTimer('ExecuteLiquidityRequests')
      try {
        await this._liquidityService.execute(this._newLiquidityRequests)
      } catch (e) {
        this._logger.error(
          e,
          `${this.constructor.name} - error executing liquidity requests`
        )
      }

      stopLiqTimer()
      this._logger.debug('+ _liquidityService() completed')
    }

    // fourth phase, flush everything to repos and return messages
    const stopFlushTimer = this._startTimer('FlushToDbPhase')
    await this._flush()
    stopFlushTimer()

    this._logger.debug('+ _msgHandlerBatch() completed')

    stopTimer()
    return this._outputEvents
  }

  private async _preFetchPhase(cmds: IMessage[]) {
    this._logger.debug('--- _preFetchPhase() started')

    // first phase, get everything from repos
    const quoteIdsToFetch: string[] = []
    const incomingPaymentIdsToFetch: string[] = []
    const outgoingPaymentIdsToFetch: string[] = []
    const walletIdsToFetch: string[] = []

    const addWalletId = (id: string) => {
      if (!walletIdsToFetch.includes(id)) {
        walletIdsToFetch.push(id)
      }
    }
    const addQuoteId = (id: string) => {
      if (!quoteIdsToFetch.includes(id)) {
        quoteIdsToFetch.push(id)
      }
    }
    const addIncomingId = (id: string) => {
      if (!incomingPaymentIdsToFetch.includes(id)) {
        incomingPaymentIdsToFetch.push(id)
      }
    }
    const addOutgoingId = (id: string) => {
      if (!outgoingPaymentIdsToFetch.includes(id)) {
        outgoingPaymentIdsToFetch.push(id)
      }
    }

    for (const cmd of cmds) {
      if (cmd.msgName === CreateIncomingPaymentCmd.name) {
        const specCmd = cmd as CreateIncomingPaymentCmd

        addWalletId(specCmd.payload.walletAddressId)

        if (specCmd.payload.id) {
          addIncomingId(specCmd.payload.id)
        }
      } else if (cmd.msgName === CreateQuoteCmd.name) {
        const specCmd = cmd as CreateQuoteCmd

        addWalletId(specCmd.payload.senderWalletAddressId)
        addIncomingId(specCmd.payload.incomingPaymentId)
        if (specCmd.payload.id) {
          addQuoteId(specCmd.payload.id)
        }
      } else if (cmd.msgName === CreateOutgoingPaymentCmd.name) {
        const specCmd = cmd as CreateOutgoingPaymentCmd

        addIncomingId(specCmd.payload.incomingPaymentId)
        addWalletId(specCmd.payload.senderWalletAddressId)

        if (specCmd.payload.id) {
          addOutgoingId(specCmd.payload.id)
        }

        if (specCmd.payload.quoteId) {
          addQuoteId(specCmd.payload.quoteId)
        }
      } else {
        this._logger.warn(
          `${this.constructor.name} - unknown command - msgName: ${cmd.msgName} msgKey: ${cmd.msgKey} msgId: ${cmd.msgId}`
        )
      }
    }

    const promises: Promise<any>[] = []

    if (walletIdsToFetch.length > 0) {
      promises.push(this._walletAddressRepository.fetchByIds(walletIdsToFetch))
    } else {
      promises.push(Promise.resolve([]))
    }

    if (incomingPaymentIdsToFetch.length > 0) {
      promises.push(
        this._incomingPaymentRepository.fetchByIds(incomingPaymentIdsToFetch)
      )
    } else {
      promises.push(Promise.resolve([]))
    }

    if (quoteIdsToFetch.length > 0) {
      promises.push(this._quoteRepository.fetchByIds(quoteIdsToFetch))
    } else {
      promises.push(Promise.resolve([]))
    }

    if (outgoingPaymentIdsToFetch.length > 0) {
      promises.push(
        this._outgoingPaymentRepository.fetchByIds(outgoingPaymentIdsToFetch)
      )
    } else {
      promises.push(Promise.resolve([]))
    }

    const [wallets, incoming, quotes, outgoing] = await Promise.all(promises)
    this._preFetchedWalletAddress = wallets
    this._preFetchedIncomingPayments = incoming
    this._preFetchedQuotes = quotes
    this._preFetchedOutgoingPayments = outgoing
    this._logger.debug('+++ _preFetchPhase() completed')
  }

  private async _flush(): Promise<void> {
    this._logger.debug('--- _flush() started')
    const promises: Promise<void>[] = []

    if (this._newIncomingPayments.length) {
      promises.push(
        this._incomingPaymentRepository.storeMany(this._newIncomingPayments)
      )
    }

    if (this._newOutgoingPayments.length) {
      promises.push(
        this._outgoingPaymentRepository.storeMany(this._newOutgoingPayments)
      )
    }

    if (this._newQuotes.length) {
      promises.push(this._quoteRepository.storeMany(this._newQuotes))
    }

    if (this._newIncomingMicroPayments.length) {
      promises.push(
        this._incomingPaymentRepository.storeManyNewMicroPayment(
          this._newIncomingMicroPayments
        )
      )
    }

    if (this._newOutgoingMicroPayments.length) {
      promises.push(
        this._outgoingPaymentRepository.storeManyNewMicroPayment(
          this._newOutgoingMicroPayments
        )
      )
    }

    if (this._newIncomingPaymentUpdates.length) {
      promises.push(
        this._incomingPaymentRepository.updateReceivedAmountAndStateMany(
          this._newIncomingPaymentUpdates
        )
      )
    }

    await Promise.all(promises)
    this._logger.debug('+++ _flush() completed')
  }

  private _addLiquidityRequestToTmp(reqs: LiquidityRequest[]): void {
    this._newLiquidityRequests.push(...reqs)
  }

  private _getWalletFromTmp(id: string): WalletAddress | null {
    const found = this._preFetchedWalletAddress.find((item) => item.id === id)
    return found || null
  }

  private _getQuoteFromTmp(id: string): Quote | null {
    const found = this._preFetchedQuotes.find((item) => item.id === id)
    return found || null
  }

  private _addQuoteToTmp(newItem: Quote): void {
    const foundIndex = this._newQuotes.findIndex(
      (item) => item.id === newItem.id
    )
    if (foundIndex == -1) {
      this._newQuotes.push(newItem)
    } else {
      this._newQuotes[foundIndex] = newItem
    }
  }

  private _getIncomingPaymentFromTmp(id: string): IncomingPayment | null {
    const found = this._preFetchedIncomingPayments.find(
      (item) => item.id === id
    )
    return found || null
  }

  private _addIncomingPaymentToTmp(newItem: IncomingPayment): void {
    const foundIndex = this._newIncomingPayments.findIndex(
      (item) => item.id === newItem.id
    )
    if (foundIndex == -1) {
      this._newIncomingPayments.push(newItem)
    } else {
      this._newIncomingPayments[foundIndex] = newItem
    }
  }

  private _addIncomingUpdateToTmp(
    incomingPaymentId: string,
    newReceivedAmount: bigint,
    newState?: LocalIncomingPaymentState
  ): void {
    const foundIndex = this._newIncomingPaymentUpdates.findIndex(
      (item) => item.incomingPaymentId === incomingPaymentId
    )

    const newObj = {
      incomingPaymentId: incomingPaymentId,
      newReceivedAmount: newReceivedAmount,
      newState: newState
    }

    if (foundIndex == -1) {
      this._newIncomingPaymentUpdates.push(newObj)
    } else {
      this._newIncomingPaymentUpdates[foundIndex] = newObj
    }
  }

  private _getOutgoingPayment(id: string): OutgoingPayment | null {
    const found = this._preFetchedOutgoingPayments.find(
      (item) => item.id === id
    )
    return found || null
  }

  private _addOutgoingPaymentToTmp(newItem: OutgoingPayment): void {
    const foundIndex = this._newOutgoingPayments.findIndex(
      (item) => item.id === newItem.id
    )
    if (foundIndex == -1) {
      this._newOutgoingPayments.push(newItem)
    } else {
      this._newOutgoingPayments[foundIndex] = newItem
    }
  }

  public async _createIncomingPayment(
    cmd: CreateIncomingPaymentCmd
  ): Promise<string> {
    const stopTimer = this._startTimer('CreateIncomingPaymentCmd')

    let id: string
    if (cmd.payload.id) {
      if (cmd.payload.id.length > 64) {
        // TODO, send error event
        throw new InvalidIdLengthError(
          'Incoming Payment ID is too long (max 64 characters)'
        )
      }

      const exists = this._getIncomingPaymentFromTmp(cmd.payload.id)
      if (exists) {
        // TODO, send error event
        throw new DuplicateIncomingPaymentFoundError()
      }
      id = cmd.payload.id
    } else {
      id = crypto.randomUUID()
    }

    const walletAddress = this._getWalletFromTmp(cmd.payload.walletAddressId)

    if (!walletAddress) {
      stopTimer()
      throw new WalletAddressNotFoundError()
    }

    if (!walletAddress.isActive) {
      stopTimer()
      throw new WalletAddressInactiveError()
    }

    if (
      cmd.payload.incomingAmount &&
      (walletAddress.assetCode !== cmd.payload.incomingAmount.assetCode ||
        walletAddress.assetScale !== cmd.payload.incomingAmount.assetScale)
    ) {
      stopTimer()
      throw new IncomingPaymentWalletAddressAssetMismatchError()
    }

    let incomingAmount: Amount | undefined = undefined
    if (cmd.payload.incomingAmount) {
      incomingAmount = {
        assetCode: cmd.payload.incomingAmount.assetCode,
        assetScale: cmd.payload.incomingAmount.assetScale,
        value: BigInt(cmd.payload.incomingAmount.value)
      }
    }

    if (
      cmd.payload.expiresAt &&
      (cmd.payload.expiresAt.getTime() <= Date.now() ||
        cmd.payload.expiresAt.getTime() >
          Date.now() + INCOMING_PAYMENT_MAX_EXPIRY_MS)
    ) {
      stopTimer()
      throw new InvalidIncomingPaymentExpiryError()
    }

    const expiresAt =
      cmd.payload.expiresAt ??
      new Date(Date.now() + INCOMING_PAYMENT_DEFAULT_EXPIRY)

    const newIncomingPayment: IncomingPayment = {
      id,
      incomingAmount: incomingAmount?.value || undefined,
      receivedAmount: 0n,
      expiresAt,
      walletAddressId: walletAddress.id,
      type: 'LOCAL',
      state: LocalIncomingPaymentState.CREATED,
      asset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale
      }
    }

    this._addIncomingPaymentToTmp(newIncomingPayment)

    await this._paymentEventProducer.publish([
      {
        type: PaymentEventType.INCOMING_PAYMENT_CREATED,
        data: {
          incomingPayment: newIncomingPayment
        }
      }
    ])

    stopTimer()
    return id
  }

  private async _fetchIncomingPayment(
    incomingPaymentId: string
  ): Promise<IncomingPayment | RemoteIncomingPayment | undefined> {
    const localIncomingPayment =
      this._getIncomingPaymentFromTmp(incomingPaymentId)
    if (localIncomingPayment) {
      return localIncomingPayment
    }

    const stopTimer = this._startTimer('fetchRemotePayment')

    const remoteIncomingPayment =
      await this._remoteIncomingPaymentService.getById(incomingPaymentId)

    stopTimer()
    return remoteIncomingPayment
  }

  public async _createQuote(cmd: CreateQuoteCmd): Promise<string> {
    const stopTimer = this._startTimer('CreateQuoteCmd')

    let id: string
    if (cmd.payload.id) {
      if (cmd.payload.id.length > 64) {
        throw new InvalidIdLengthError(
          'Quote ID is too long (max 64 characters)'
        )
      }
      const stopTimerRepo = this._startTimer('CreateQuoteCmd.repoExists')
      const exists = this._getQuoteFromTmp(cmd.payload.id)
      stopTimerRepo()

      if (exists) {
        throw new DuplicateQuoteFoundError()
      }

      id = cmd.payload.id
    } else {
      id = crypto.randomUUID()
    }

    const walletAddress = this._getWalletFromTmp(
      cmd.payload.senderWalletAddressId
    )

    // const incomingPayment = await this._fetchIncomingPayment(cmd.payload.incomingPaymentId);
    const incomingPayment = this._getIncomingPaymentFromTmp(
      cmd.payload.incomingPaymentId
    )

    if (!walletAddress) {
      stopTimer()
      throw new WalletAddressNotFoundError()
    }

    if (!walletAddress.isActive) {
      stopTimer()
      throw new WalletAddressInactiveError()
    }

    if (!incomingPayment) {
      stopTimer()
      throw new IncomingPaymentNotFoundError(
        `Could not find incomingPayment with id: ${cmd.payload.incomingPaymentId} for quote with id ${id}`
      )
    }

    let createdId: string

    const request: CreateQuoteRequest = {
      id: cmd.payload.id,
      debitAmount: cmd.payload.debitAmount
        ? {
            assetCode: cmd.payload.debitAmount.assetCode,
            assetScale: cmd.payload.debitAmount.assetScale,
            value: BigInt(cmd.payload.debitAmount.value)
          }
        : undefined,
      receiveAmount: cmd.payload.receiveAmount
        ? {
            assetCode: cmd.payload.receiveAmount.assetCode,
            assetScale: cmd.payload.receiveAmount.assetScale,
            value: BigInt(cmd.payload.receiveAmount.value)
          }
        : undefined,
      senderWalletAddressId: cmd.payload.senderWalletAddressId,
      incomingPaymentId: cmd.payload.incomingPaymentId
    }

    if (incomingPayment.type === 'LOCAL') {
      createdId = await this.createLocalQuote(
        request,
        id,
        incomingPayment,
        walletAddress
      )
    } else {
      throw new Error('not implemented')
      // createdId = await this.createRemoteQuote(request, id, incomingPayment, walletAddress);
    }

    stopTimer()
    return createdId
  }

  public async createLocalQuote(
    request: CreateQuoteRequest,
    id: string,
    incomingPayment: IncomingPayment,
    walletAddress: WalletAddress
  ): Promise<string> {
    const stopTimer = this._startTimer('createLocalQuote')

    if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
      stopTimer()
      throw new IncomingPaymentInvalidStateError()
    }

    // We are assuming we don't care about how much has already been paid into
    // an incoming payment. Let the quote happen.

    let quoteReceiveAmount: Amount
    let quoteDebitAmount: Amount
    let exchangeRate: number

    if (request.debitAmount) {
      const result = await this._calculateReceiveAmountFromDebitAmount({
        debitAmount: request.debitAmount,
        walletAddress,
        incomingPayment
      })

      quoteReceiveAmount = result.receiveAmount
      exchangeRate = result.exchangeRate
      quoteDebitAmount = request.debitAmount
    } else if (request.receiveAmount) {
      const result = await this._calculateDebitAmountFromReceiveAmount({
        receiveAmount: request.receiveAmount,
        walletAddress,
        incomingPayment
      })

      quoteDebitAmount = result.debitAmount
      exchangeRate = result.exchangeRate
      quoteReceiveAmount = request.receiveAmount
    } else if (incomingPayment.incomingAmount) {
      const result = await this._calculateDebitAmountFromIncomingPaymentAmount({
        walletAddress,
        incomingPayment: {
          ...incomingPayment,
          incomingAmount: incomingPayment.incomingAmount
        }
      })

      quoteDebitAmount = result.debitAmount
      exchangeRate = result.exchangeRate
      quoteReceiveAmount = {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: incomingPayment.incomingAmount
      }
    } else {
      stopTimer()
      throw new InvalidAmountError()
    }

    const quoteDefaultExpiryMs = new Date().getTime() + QUOTE_EXPIRY_MS

    const newQuote: Quote = {
      id,
      receiveAmount: quoteReceiveAmount,
      debitAmount: quoteDebitAmount,
      senderWalletAddressId: walletAddress.id,
      incomingPaymentId: incomingPayment.id,
      exchangeRate,
      expiresAt: new Date(
        Math.min(incomingPayment.expiresAt.getTime(), quoteDefaultExpiryMs)
      )
    }

    this._addQuoteToTmp(newQuote)

    stopTimer()
    return id
  }

  public async createRemoteQuote(
    request: CreateQuoteRequest,
    id: string,
    incomingPayment: RemoteIncomingPayment,
    walletAddress: WalletAddress
  ): Promise<string> {
    throw new Error('not implemented')
    // // TODO: Do we need to check remote incoming payment here?
    //
    // const stopTimer = this._startTimer("createRemoteQuote");
    //
    // const quoteDefaultExpiryMs = new Date().getTime() + QUOTE_EXPIRY_MS;
    //
    // // TODO: handle debit & receive amount
    // const newQuote: Quote = {
    //     id,
    //     receiveAmount: request.debitAmount!,
    //     debitAmount: request.debitAmount!,
    //     senderWalletAddressId: walletAddress.id,
    //     incomingPaymentId: incomingPayment.id,
    //     exchangeRate: 1,
    //     expiresAt: new Date(quoteDefaultExpiryMs),
    // };
    //
    // this._addQuoteToTmp(newQuote);
    //
    // const event: RemoteQuoteRequestedEvent = {
    //     type: PaymentEventType.REMOTE_QUOTE_REQUESTED,
    //     data: {
    //         quote: {
    //             id,
    //             debitAmount: request.debitAmount!,
    //             senderWalletAddressId: walletAddress.id,
    //         },
    //         incomingPayment,
    //     },
    // };
    //
    // await this._paymentEventProducer.publish([event]);
    //
    // stopTimer();
    // return id;
  }

  private async _calculateReceiveAmountFromDebitAmount({
    debitAmount,
    walletAddress,
    incomingPayment
  }: {
    debitAmount: Amount
    incomingPayment: IncomingPayment
    walletAddress: WalletAddress
  }): Promise<{
    exchangeRate: number
    receiveAmount: Amount
  }> {
    if (
      debitAmount.assetCode !== walletAddress.assetCode ||
      debitAmount.assetScale !== walletAddress.assetScale ||
      debitAmount.value <= 0n
    ) {
      throw new InvalidAmountError()
    }

    const isSameAssetQuote =
      debitAmount.assetCode === incomingPayment.asset.code

    if (isSameAssetQuote) {
      const exchangeRate =
        10 ** (incomingPayment.asset.scale - debitAmount.assetScale)
      const receiveAmountValue = BigInt(
        Math.floor(Number(debitAmount.value) * exchangeRate)
      )

      return {
        receiveAmount: {
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale,
          value: receiveAmountValue
        },
        exchangeRate
      }
    }

    const conversionResponse = await this._ratesService.convertFromSource({
      destinationAsset: incomingPayment.asset,
      sourceAmount: debitAmount.value,
      sourceAsset: {
        code: debitAmount.assetCode,
        scale: debitAmount.assetScale
      }
    })

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError()
    }

    return {
      receiveAmount: {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: conversionResponse.destinationAmount
      },
      exchangeRate: conversionResponse.exchangeRate
    }
  }

  private async _calculateDebitAmountFromReceiveAmount({
    receiveAmount,
    walletAddress,
    incomingPayment
  }: {
    receiveAmount: Amount
    incomingPayment: IncomingPayment
    walletAddress: WalletAddress
  }): Promise<{
    exchangeRate: number
    debitAmount: Amount
  }> {
    if (
      receiveAmount.assetCode !== incomingPayment.asset.code ||
      receiveAmount.assetScale !== incomingPayment.asset.scale ||
      receiveAmount.value <= 0n
    ) {
      throw new InvalidAmountError()
    }

    const isSameAssetQuote = receiveAmount.assetCode === walletAddress.assetCode
    if (isSameAssetQuote) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2, may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - receiveAmount.assetScale)
      const debitAmountValue = BigInt(
        Math.ceil(Number(receiveAmount.value) * exchangeRate)
      )

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue
        },
        exchangeRate
      }
    }

    const conversionResponse = await this._ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: receiveAmount.value,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale
      }
    })

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError()
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount
      },
      exchangeRate: conversionResponse.exchangeRate
    }
  }

  private async _calculateDebitAmountFromIncomingPaymentAmount({
    walletAddress,
    incomingPayment
  }: {
    incomingPayment: IncomingPayment & {
      incomingAmount: Pick<IncomingPayment, 'incomingAmount'>
    }
    walletAddress: WalletAddress
  }): Promise<{
    exchangeRate: number
    debitAmount: Amount
  }> {
    if (
      walletAddress.assetCode !== incomingPayment.asset.code ||
      walletAddress.assetScale !== incomingPayment.asset.scale
    ) {
      throw new InvalidAmountError()
    }

    if (incomingPayment.asset.code === walletAddress.assetCode) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2 may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - incomingPayment.asset.scale)
      const debitAmountValue = BigInt(
        Math.ceil(Number(incomingPayment.incomingAmount) * exchangeRate)
      )

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue
        },
        exchangeRate
      }
    }

    const conversionResponse = await this._ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: incomingPayment.incomingAmount,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale
      }
    })

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError()
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount
      },
      exchangeRate: conversionResponse.exchangeRate
    }
  }

  public async _createOutgoingPayment(
    cmd: CreateOutgoingPaymentCmd
  ): Promise<string> {
    const stopTimer = this._startTimer('CreateOutgoingPaymentCmd')
    const request = {
      senderWalletAddressId: cmd.payload.senderWalletAddressId
    } as CreateOutgoingPaymentFromQuoteRequest &
      CreateOutgoingPaymentFromIncomingPaymentRequest

    if (cmd.payload.id) {
      request.id = cmd.payload.id
    }
    if (cmd.payload.incomingPaymentId) {
      request.incomingPaymentId = cmd.payload.incomingPaymentId
    }
    if (cmd.payload.quoteId) {
      request.quoteId = cmd.payload.quoteId
    }
    if (cmd.payload.debitAmount) {
      request.debitAmount = {
        ...cmd.payload.debitAmount,
        value: BigInt(cmd.payload.debitAmount.value)
      }
    }

    let createdId: string
    if ('quoteId' in request) {
      createdId = await this._createOutgoingPaymentFromQuote(
        request as CreateOutgoingPaymentFromQuoteRequest
      )
    } else if ('incomingPaymentId' in request) {
      createdId = await this._createOutgoingPaymentFromIncomingPayment(
        request as CreateOutgoingPaymentFromIncomingPaymentRequest
      )
    } else {
      stopTimer()
      throw new OutgoingPaymentMissingIdentifierError()
    }

    stopTimer()
    return createdId
  }

  private async _createOutgoingPaymentFromQuote(
    request: CreateOutgoingPaymentFromQuoteRequest
  ): Promise<string> {
    const stopTimer = this._startTimer('CreateOutgoingPaymentFromQuote')

    let outgoingPaymentId

    if (request.id) {
      if (request.id.length > 64) {
        throw new InvalidIdLengthError(
          'Outgoing Payment ID is too long (max 64 characters)'
        )
      }

      const exists = this._getOutgoingPayment(request.id)

      if (exists) {
        stopTimer()
        throw new DuplicateOutgoingPaymentFoundError()
      }
      outgoingPaymentId = request.id
    } else {
      outgoingPaymentId = crypto.randomUUID()
    }

    const walletAddress = this._getWalletFromTmp(request.senderWalletAddressId)

    if (!walletAddress) {
      stopTimer()
      throw new WalletAddressNotFoundError()
    }

    if (!walletAddress.isActive) {
      stopTimer()
      throw new WalletAddressInactiveError()
    }

    const quote = this._getQuoteFromTmp(request.quoteId)

    if (!quote) {
      stopTimer()
      throw new QuoteNotFoundError(
        `Could not find quote with id ${request.quoteId} for outgoing payment id: ${outgoingPaymentId}`
      )
    }

    // TODO: Check quote hasn't been used already

    if (quote.expiresAt <= new Date()) {
      stopTimer()
      throw new QuoteExpiredError()
    }

    // const incomingPayment = await this._fetchIncomingPayment(
    //     quote.incomingPaymentId
    // );

    const incomingPayment = this._getIncomingPaymentFromTmp(
      quote.incomingPaymentId
    )

    if (!incomingPayment) {
      stopTimer()
      throw new IncomingPaymentNotFoundError(
        `Could not find incomingPayment with id: ${quote.incomingPaymentId} for quote with id ${quote.id}`
      )
    }

    if (incomingPayment.type === 'LOCAL') {
      if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
        stopTimer()
        throw new IncomingPaymentInvalidStateError()
      }

      // create both liquidity requests
      const depositWalletAddressLiqReq =
        new WalletAddressDepositLiquidityRequest(
          crypto.randomUUID(),
          quote.senderWalletAddressId,
          quote.debitAmount
        )
      this._addLiquidityRequestToTmp([depositWalletAddressLiqReq])

      // TODO: FX handling, if receiving wallet asset is different than sending wallet
      const walletToWalletLiqReq = new WalletToWalletAddressLiquidityRequest(
        crypto.randomUUID(),
        quote.senderWalletAddressId,
        incomingPayment.walletAddressId,
        quote.debitAmount
      )
      this._addLiquidityRequestToTmp([walletToWalletLiqReq])

      // completed outgoing payment
      const outgoingPayment: OutgoingPayment = {
        id: outgoingPaymentId,
        quoteId: quote.id,
        senderWalletAddressId: walletAddress.id,
        asset: {
          code: walletAddress.assetCode,
          scale: walletAddress.assetScale
        },
        debitAmount: quote.debitAmount.value,
        sentAmount: quote.debitAmount.value, //
        localIncomingPaymentId: incomingPayment.id,
        state: OutgoingPaymentState.COMPLETED // TODO: check if the outgoing payment request came from third party, and webhook out to ASE instead of marking as FUNDED directly
      }
      this._addOutgoingPaymentToTmp(outgoingPayment)

      const outgoingMicroPayment: MicroPayment = {
        requestId: outgoingPayment.id,
        amount: outgoingPayment.debitAmount,
        method: 'LOCAL'
      }
      this._newOutgoingMicroPayments.push({
        outgoingPaymentId: outgoingPayment.id,
        microPayment: outgoingMicroPayment
      })

      const incomingMicroPayment: MicroPayment = {
        requestId: incomingPayment.id,
        amount: quote.receiveAmount.value, // TODO: need to send _up to_ to incomingAmount, as the quoted amount might be more
        method: 'LOCAL'
      }
      this._newIncomingMicroPayments.push({
        incomingPaymentId: incomingPayment.id,
        microPayment: incomingMicroPayment
      })

      incomingPayment.receivedAmount += quote.receiveAmount.value

      if (
        incomingPayment.incomingAmount &&
        incomingPayment.receivedAmount >= incomingPayment.incomingAmount
      ) {
        incomingPayment.state = LocalIncomingPaymentState.COMPLETED

        this._addIncomingUpdateToTmp(
          incomingPayment.id,
          incomingPayment.receivedAmount,
          incomingPayment.state
        )
      } else {
        this._addIncomingUpdateToTmp(
          incomingPayment.id,
          incomingPayment.receivedAmount
        )
      }

      /*
       * NOTE nothing consumes the INCOMING_PAYMENT_COMPLETED or
       * OUTGOING_PAYMENT_COMPLETED - removed those blocks
       */

      // await this._paymentEventProducer.publish(events);
      this._telemetryService.incrementCounter('outgoing_payments_completed', 1)

      stopTimer()
      return outgoingPayment.id
    }

    /*
     * REMOTE branch
     * */

    const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
      crypto.randomUUID(),
      request.senderWalletAddressId,
      quote.debitAmount
    )

    this._addLiquidityRequestToTmp([walletAddressFundRequest])

    const outgoingPayment: OutgoingPayment = {
      id: crypto.randomUUID(),
      quoteId: quote.id,
      senderWalletAddressId: walletAddress.id,
      asset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale
      },
      debitAmount: quote.debitAmount.value,
      sentAmount: 0n,
      remoteIncomingPaymentUrl: incomingPayment.id,
      state: 'FUNDED'
    }
    this._addOutgoingPaymentToTmp(outgoingPayment)

    /*
     * NOTE nothing consumes the REMOTE_OUTGOING_PAYMENT_FUNDED - removed this block
     */

    /*const remoteOutgoingPaymentFundedEvent: RemoteOutgoingPaymentFundedEvent = {
            type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
            data: {
                outgoingPaymentId: outgoingPayment.id,
                debitAmount: quote.debitAmount,
                receiveAmount: quote.receiveAmount,
                remoteIncomingPaymentUrl: outgoingPayment.remoteIncomingPaymentUrl!,
                quoteExpiresAt: quote.expiresAt,
                ilpDetails: incomingPayment.ilpDetails,
            },
        };

        // TODO: Do we need to place a hold amount for a wallet address => peer transfer? Even though we fully funded the payment already?

        await this._paymentEventProducer.publish([remoteOutgoingPaymentFundedEvent]);
        */

    stopTimer()
    return outgoingPayment.id
  }

  private async _createOutgoingPaymentFromIncomingPayment(
    request: CreateOutgoingPaymentFromIncomingPaymentRequest
  ): Promise<string> {
    throw new Error('not implemented')
    //
    // let outgoingPaymentId;
    //
    // if (request.id) {
    //     if (request.id.length > 64) {
    //         throw new InvalidIdLengthError(
    //             "Outgoing Payment ID is too long (max 64 characters)"
    //         );
    //     }
    //
    //     const exists = this._getOutgoingPayment(request.id);
    //
    //     if (exists) {
    //         throw new DuplicateOutgoingPaymentFoundError();
    //     }
    //     outgoingPaymentId = request.id;
    // } else {
    //     outgoingPaymentId = crypto.randomUUID();
    // }
    //
    // const walletAddress = this._getWalletFromTmp(request.senderWalletAddressId);
    //
    // const incomingPayment = this._getIncomingPaymentFromTmp(request.incomingPaymentId);
    //
    // if (!walletAddress) {
    //     throw new WalletAddressNotFoundError();
    // }
    //
    // if (!walletAddress.isActive) {
    //     throw new WalletAddressInactiveError();
    // }
    //
    // if (!incomingPayment) {
    //     throw new IncomingPaymentNotFoundError(`Could not find incomingPayment with id: ${request.incomingPaymentId} for outgoingPayment with id ${outgoingPaymentId}`);
    // }
    //
    // if (incomingPayment.type === "LOCAL") {
    //     if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
    //         throw new IncomingPaymentInvalidStateError();
    //     }
    //
    //     let debitAmount: Amount;
    //     let receiveAmount: Amount;
    //
    //     if (
    //         request.debitAmount.assetCode !== walletAddress.assetCode ||
    //         request.debitAmount.assetScale !== walletAddress.assetScale ||
    //         request.debitAmount.value <= 0n
    //     ) {
    //         throw new InvalidAmountError();
    //     }
    //
    //     debitAmount = request.debitAmount;
    //
    //     const result = await this._calculateReceiveAmountFromDebitAmount({
    //         debitAmount,
    //         walletAddress,
    //         incomingPayment,
    //     });
    //
    //     receiveAmount = result.receiveAmount;
    //
    //     if (
    //         typeof incomingPayment.incomingAmount === "bigint" &&
    //         receiveAmount.value < incomingPayment.incomingAmount
    //     ) {
    //         throw new InvalidAmountError();
    //     }
    //
    //     const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
    //         crypto.randomUUID(),
    //         walletAddress.id, debitAmount
    //     );
    //
    //
    //     this._addLiquidityRequestToTmp([walletAddressFundRequest]);
    //
    //     const outgoingPayment: OutgoingPayment = {
    //         id: outgoingPaymentId,
    //         senderWalletAddressId: walletAddress.id,
    //         asset: {
    //             code: walletAddress.assetCode,
    //             scale: walletAddress.assetScale,
    //         },
    //         debitAmount: debitAmount.value,
    //         sentAmount: 0n,
    //         localIncomingPaymentId: incomingPayment.id,
    //         state: OutgoingPaymentState.FUNDED,
    //     };
    //
    //     const localOutgoingPaymentFundedEvent: LocalOutgoingPaymentFundedEvent = {
    //         type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
    //         data: {
    //             outgoingPayment,
    //             incomingPayment,
    //             senderWalletAddressId: walletAddress.id,
    //             receiveAmount,
    //             debitAmount,
    //         },
    //     };
    //
    //     this._addOutgoingPaymentToTmp(outgoingPayment);
    //
    //     await this._paymentEventProducer.publish([
    //         localOutgoingPaymentFundedEvent,
    //     ]);
    //
    //     return outgoingPayment.id;
    // }
    //
    // /*
    // * REMOTE branch
    // * */
    //
    //
    // const walletAddressFundRequest = new WalletAddressDepositLiquidityRequest(
    //     crypto.randomUUID(),
    //     request.senderWalletAddressId,
    //     request.debitAmount
    // );
    //
    // this._addLiquidityRequestToTmp([walletAddressFundRequest]);
    //
    // const outgoingPayment: OutgoingPayment = {
    //     id: crypto.randomUUID(),
    //     senderWalletAddressId: walletAddress.id,
    //     asset: {
    //         code: walletAddress.assetCode,
    //         scale: walletAddress.assetScale,
    //     },
    //     debitAmount: request.debitAmount.value,
    //     sentAmount: 0n,
    //     remoteIncomingPaymentUrl: incomingPayment.id,
    //     state: OutgoingPaymentState.FUNDED,
    // };
    // this._addOutgoingPaymentToTmp(outgoingPayment);
    //
    // // DISABLED, can't get incomingPayment.ilpDetails
    // // const remoteOutgoingPaymentFundedEvent: RemoteOutgoingPaymentFundedEvent =
    // //     {
    // //         type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
    // //         data: {
    // //             outgoingPaymentId: outgoingPayment.id,
    // //             debitAmount: request.debitAmount,
    // //             remoteIncomingPaymentUrl: outgoingPayment.remoteIncomingPaymentUrl!,
    // //             ilpDetails: incomingPayment.ilpDetails,
    // //         },
    // //     };
    // //
    // // await this._paymentEventProducer.publish([
    // //     remoteOutgoingPaymentFundedEvent,
    // // ]);
    //
    // return outgoingPayment.id;
  }

  private _addMicroPaymentToIncomingPayment(
    incomingPayment: IncomingPayment,
    microPayment: MicroPayment
  ): IncomingPaymentWithNewMicroPaymentUpdate {
    if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
      throw new IncomingPaymentCannotReceiveMicroPayment()
    }

    incomingPayment.receivedAmount += microPayment.amount // received amount can be larger than incoming amount because of FX

    const update: IncomingPaymentWithNewMicroPaymentUpdate = {
      microPayment,
      receivedAmount: incomingPayment.receivedAmount
    }

    if (
      incomingPayment.incomingAmount &&
      incomingPayment.receivedAmount >= incomingPayment.incomingAmount
    ) {
      incomingPayment.state = LocalIncomingPaymentState.COMPLETED
      update.state = incomingPayment.state
    }

    return update
  }

  private _addMicroPaymentToOutgoingPayment(
    outgoingPayment: OutgoingPayment,
    microPayment: MicroPayment
  ): OutgoingPaymentWithNewMicroPaymentUpdate {
    if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
      throw new OutgoingPaymentInvalidStateError()
    }

    outgoingPayment.sentAmount += microPayment.amount

    const update: OutgoingPaymentWithNewMicroPaymentUpdate = {
      microPayment,
      sentAmount: microPayment.amount
    }

    // TODO: determine whether this can/should happen
    if (outgoingPayment.sentAmount > outgoingPayment.debitAmount) {
      throw new OutgoingPaymentInvalidStateError()
    }

    if (outgoingPayment.sentAmount === outgoingPayment.debitAmount) {
      outgoingPayment.state = OutgoingPaymentState.COMPLETED
      update.state = outgoingPayment.state
    }

    return update
  }

  // We can decide whether we want to keep this event or not, or just complete the outgoing payment synchronously in the payment handler,
  // in order to save one call to the liquidity service (we can fund the wallet address and make the wallet to wallet transfer directly in a single request)
  public async handleLocalOutgoingPaymentFundedEvent(
    event: LocalOutgoingPaymentFundedEvent
  ) {
    throw new Error('not implemented')
  }

  public async handleIlpPaymentFulfillPacketReceivedEvent(
    event: IlpPaymentFulfillPacketReceivedEvent
  ) {
    throw new Error('not implemented')
    // const stopTimer = this._startTimer("handleIlpPaymentFulfillPacketReceivedEvent");
    //
    // const outgoingPayment = await this._outgoingPaymentRepository.fetchById(
    //     event.data.outgoingPaymentId
    // );
    //
    // if (!outgoingPayment) {
    //     stopTimer();
    //     throw new OutgoingPaymentNotFoundError();
    // }
    //
    // if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
    //     stopTimer();
    //     throw new OutgoingPaymentInvalidStateError();
    // }
    //
    // if (event.data.amount.assetCode !== outgoingPayment.asset.code) {
    //     throw new Error("FX during packet handling not implemented");
    // }
    // // We lost precision
    // if (event.data.amount.assetScale > outgoingPayment.asset.scale) {
    //     stopTimer();
    //     throw new OutgoingPaymentInvalidStateError();
    // }
    //
    // const transfer = new WalletAddressToPeerLiquidityRequest(
    //     event.data.requestId,
    //     outgoingPayment.senderWalletAddressId,
    //     event.data.peerId,
    //     event.data.amount,
    // );
    //
    // const stopTimerLiqSvc = this._telemetryService.startTimer(
    //     "command_handler_msg_handler_ms",
    //     {
    //         callName: `PaymentService.createOutgoingPaymentFromQuote.liq`,
    //         description: "TODO",
    //     }
    // );
    // await this._liquidityService.execute([transfer]);
    // stopTimerLiqSvc();
    //
    // const scaledRate = BigInt(
    //     10 ** (outgoingPayment.asset.scale - event.data.amount.assetScale)
    // );
    //
    // const microPayment: MicroPayment = {
    //     requestId: event.data.requestId,
    //     ilpPeerId: event.data.peerId,
    //     amount: event.data.amount.value * scaledRate,
    //     method: "ILP",
    // };
    //
    // const update = this._addMicroPaymentToOutgoingPayment(
    //     outgoingPayment,
    //     microPayment
    // );
    //
    // const events: LocalEvent[] = [];
    //
    // // TODO: do we need to know whether the incoming payment was completed? Or we just need to know that the connection was done/closed?
    // // or do we just check the status of the micro
    //
    // if (
    //     // @ts-ignore
    //     outgoingPayment.state === OutgoingPaymentState.COMPLETED || // Micropayment could have completed payment
    //     event.data.didCompleteIncomingPayment
    // ) {
    //     outgoingPayment.state = OutgoingPaymentState.COMPLETED;
    //
    //     const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
    //         type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED,
    //         data: {
    //             outgoingPayment,
    //         },
    //     };
    //     events.push(outgoingPaymentCompletedEvent);
    // }
    //
    // await this._outgoingPaymentRepository.updateWithNewMicroPayment(
    //     outgoingPayment,
    //     update
    // );
    //
    // stopTimer();
    // await this._paymentEventProducer.publish(events);
    // this._telemetryService.incrementCounter("outgoing_payments_completed", 1);
  }

  public async handleIlpPaymentPreparePacketReceivedEvent(
    event: IlpPaymentPreparePacketReceivedEvent
  ) {
    throw new Error('not implemented')
  }

  public async handleIlpQuotePacketReceived(
    event: IlpQuotePacketReceivedEvent
  ): Promise<void> {
    throw new Error('not implemented')
    // const stopTimer = this._startTimer("handleIlpQuotePacketReceived");
    // const exists = await this._quoteRepository.exists(event.data.quoteId);
    //
    // if (!exists) {
    //     stopTimer();
    //     throw new QuoteNotFoundError();
    // }
    //
    // await this._quoteRepository.updateAmounts({
    //     id: event.data.quoteId,
    //     amount: event.data.amount,
    // });
    // stopTimer();
  }
}

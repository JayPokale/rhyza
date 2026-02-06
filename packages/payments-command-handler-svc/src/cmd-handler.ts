'use strict'

import os from 'os'
import {
  ApiRspErrorEvent,
  ApiRspIncomingPaymentEvent,
  ApiRspOutgoingPaymentEvent,
  ApiRspQuoteEvent,
  Attributes,
  CommandTopics,
  CreateIncomingPaymentCmd,
  CreateOutgoingPaymentCmd,
  CreateQuoteCmd,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  ITelemetryService
} from 'common-types-lib'
import {
  CreateIncomingPaymentRequest,
  CreateOutgoingPaymentFromIncomingPaymentRequest,
  CreateOutgoingPaymentFromQuoteRequest,
  CreateQuoteRequest,
  PaymentDomainService
} from 'payments-domain-lib'

const TELEMETRY_API_HISTOGRAM_NAME = 'command_handler'

export class PaymentsCommandHandler {
  private _logger: ILogger
  private _messageConsumer: IMessageConsumer
  private _messageProducer: IMessageProducer
  private _paymentService: PaymentDomainService
  private _telemetryService: ITelemetryService

  constructor(
    logger: ILogger,
    messageConsumer: IMessageConsumer,
    messageProducer: IMessageProducer,
    paymentService: PaymentDomainService,
    _telemetryService: ITelemetryService
  ) {
    this._logger = logger
    this._telemetryService = _telemetryService
    this._messageConsumer = messageConsumer
    this._messageProducer = messageProducer
    this._paymentService = paymentService
  }

  async start(): Promise<void> {
    this._messageConsumer.setTopics([
      CommandTopics.PaymentCommands
      // CommandTopics.IncomingPayments,
      // CommandTopics.Quotes,
      // CommandTopics.OutgoingPaymentsFromQuote,
    ])
    this._messageConsumer.setBatchCallbackFn(this._msgHandlerBatch.bind(this))
    //this._messageConsumer.setCallbackFn(this._msgHandler.bind(this));
    await this._messageConsumer.connect()
    await this._messageConsumer.startAndWaitForRebalance()
  }

  private _startTimer(
    callname: string
  ): (additionalAttributes?: Attributes) => void {
    return this._telemetryService.startTimer(TELEMETRY_API_HISTOGRAM_NAME, {
      callName: callname
    })
  }

  private async _msgHandlerBatch(messages: IMessage[]): Promise<void> {
    this._logger.debug(
      `\nEvent(${os.hostname()}): ${messages.length} EventReceived in batch handler`
    )
    const timerStop = this._startTimer('CmdHandlerBatch')

    this._telemetryService.updateGauge('ConsumerBatchSize', messages.length)

    const toPublishEvents: IMessage[] =
      await this._paymentService._msgHandlerBatch(messages)

    if (toPublishEvents.length > 0) {
      const timerStopPub = this._startTimer('PublishEvents')
      await this._messageProducer.send(toPublishEvents)
      timerStopPub()
    }

    timerStop()
    return
  }

  async stop(): Promise<void> {
    await this._messageConsumer.stop()
    await this._messageConsumer.disconnect(true)
  }
}

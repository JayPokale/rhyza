/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

import { ILogger, ITelemetryService } from 'common-types-lib'
import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest
} from 'fastify'
import { LiquidityRequest } from 'liquidity-types-lib/dist'
import { LiquidityDomainService } from '../domain'

export class LiquidityFastifyRouter {
  private _logger: ILogger
  private _router: FastifyInstance | undefined
  private _telemetryService: ITelemetryService
  private _liquidityService: LiquidityDomainService

  public constructor(
    logger: ILogger,
    telemetryService: ITelemetryService,
    liquidityService: LiquidityDomainService
  ) {
    this._logger = logger
    this._telemetryService = telemetryService
    this._liquidityService = liquidityService
  }

  public async init(): Promise<void> {
    //await this._router.ready();

    return Promise.resolve()
  }

  public async destroy(): Promise<void> {
    if (this._router) await this._router.close()

    return Promise.resolve()
  }

  public bindRoutes(
    fastify: FastifyInstance,
    options: FastifyPluginOptions
  ): void {
    this._router = fastify

    this._router.post('/transfers', this._handleCreateTransfers.bind(this))
    this._router.post(
      '/asset-account',
      this._handleCreateAssetAccount.bind(this)
    )
    this._router.post(
      '/wallet-address-account',
      this._handleCreateAddressAccount.bind(this)
    )
    this._router.post(
      '/ilp-peer-account',
      this._handleCreateIlpAccount.bind(this)
    )
  }

  private async _handleCreateTransfers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const origLiqRequests = request.body as LiquidityRequest[]
    this._logger.debug(
      `_handleCreateTransfers received ${origLiqRequests.length} requests in batch`
    )

    const liqRequests = origLiqRequests.map((req) => {
      req.amount.value = BigInt(req.amount.value)
      return req
    })

    try {
      await this._liquidityService.execute(liqRequests)
      reply.code(200).send()
      this._logger.debug(`_handleCreateTransfers complete`)
    } catch (e) {
      this._logger.error(e)
      reply.code(500).send()
    }
  }

  private async _handleCreateAssetAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const requestBody = request.body as any

    await this._liquidityService.createAssetAccount({
      id: requestBody.id,
      code: requestBody.code,
      scale: requestBody.scale
    })

    reply.code(200).send()
  }

  private async _handleCreateAddressAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const requestBody = request.body as any

    await this._liquidityService.createWalletAddressAccount({
      id: requestBody.id,
      assetCode: requestBody.assetCode,
      assetScale: requestBody.assetScale
    })

    reply.code(200).send()
  }

  private async _handleCreateIlpAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const requestBody = request.body as any

    await this._liquidityService.createIlpPeerAccount(
      requestBody.id,
      requestBody.assetCode,
      requestBody.assetScale
    )

    reply.code(200).send()
  }
}

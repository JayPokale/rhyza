/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

import * as TB from 'tigerbeetle-node'
import { ILedgerService } from '../../domain/interfaces'
import {
  LedgerAccount,
  LedgerAccountType,
  LedgerTransfer
} from '../../domain/types'
import {
  assetCodeToUInt32,
  convertFromTigerBeetleAccountType,
  convertToTigerBeetleAccountType,
  fromTbIdToUuid,
  parseAndLookupReplicaAddresses,
  TigerBeetleAccountCode,
  toTbAccountFlags,
  toTbId,
  uint32ToAssetCode
} from './tigerbeetle-helpers'
import { ILogger } from 'common-types-lib'

export class TigerbeetleClient implements ILedgerService {
  private readonly _logger: ILogger
  private readonly _clusterId: number
  private _replicaAddresses: string[]
  private _client!: TB.Client

  constructor(clusterId: number, replicaAddressesStr: string, logger: ILogger) {
    this._logger = logger
    this._clusterId = clusterId
    this._replicaAddresses = replicaAddressesStr.split(',')
  }

  private _checkInitialisedOrThrow(): void {
    if (this._client) return
    throw new Error(
      'Uninitialised TigerbeetleAdapter, must call init() before using'
    )
  }

  public async init(): Promise<void> {
    this._replicaAddresses = await parseAndLookupReplicaAddresses(
      this._replicaAddresses,
      this._logger
    )

    this._client = TB.createClient({
      cluster_id: BigInt(this._clusterId),
      replica_addresses: this._replicaAddresses
    })

    // simple connectivity test
    await this._client.lookupAccounts([0n])
  }

  public async fetchById(id: string): Promise<LedgerAccount | undefined> {
    this._checkInitialisedOrThrow() // guard to check class was init()'ed

    const accounts = await this._client.lookupAccounts([toTbId(id)])

    if (!accounts.length) {
      return undefined
    }

    const acc = accounts[0]

    return {
      id,
      type: convertFromTigerBeetleAccountType[
        acc.code as TigerBeetleAccountCode
      ],
      assetCode: uint32ToAssetCode(acc.ledger),
      creditsPosted: acc.credits_posted,
      debitsPosted: acc.debits_posted,
      externalRef: fromTbIdToUuid(acc.user_data_128)
    }
  }

  public async createAccounts(accounts: LedgerAccount[]): Promise<void> {
    this._checkInitialisedOrThrow() // guard to check class was init()'ed

    await this._client.createAccounts(
      accounts.map((account) => ({
        id: toTbId(account.id),
        code: convertToTigerBeetleAccountType[account.type],
        ledger: assetCodeToUInt32(account.assetCode),
        user_data_32: 0,
        user_data_64: 0n,
        user_data_128: toTbId(account.externalRef),
        reserved: 0,
        flags: toTbAccountFlags(account),
        debits_pending: 0n,
        debits_posted: 0n,
        credits_pending: 0n,
        credits_posted: 0n,
        timestamp: 0n
      }))
    )
  }

  public async createTransfers(transfers: LedgerTransfer[]): Promise<void> {
    this._checkInitialisedOrThrow() // guard to check class was init()'ed

    // TODO check return
    let errors: TB.CreateTransfersError[]

    await this._client.createTransfers(
      transfers.map((transfer) => ({
        id: toTbId(transfer.id),
        code: 1,
        ledger: assetCodeToUInt32(transfer.assetCode),
        debit_account_id: toTbId(transfer.debitAccountId),
        credit_account_id: toTbId(transfer.creditAccountId),
        user_data_32: 0,
        user_data_64: 0n,
        user_data_128: 0n,
        reserved: 0,
        flags: 0,
        timestamp: 0n,
        amount: transfer.amount,
        pending_id: 0n,
        timeout: 0
      }))
    )
  }
}

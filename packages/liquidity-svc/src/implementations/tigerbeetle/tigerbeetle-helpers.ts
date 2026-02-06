/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'
import * as dns from 'dns'
import * as net from 'net'
import * as TB from 'tigerbeetle-node'
import { LedgerAccount, LedgerAccountType } from '../../domain/types'
import { ILogger } from 'common-types-lib'

export enum TigerBeetleAccountCode {
  LIQUIDITY_ASSET = 1,
  LIQUIDITY_PEER = 2,
  LIQUIDITY_WALLET_ADDRESS = 3,
  SETTLEMENT = 101
}

export const convertToTigerBeetleAccountType: {
  [key in LedgerAccountType]: TigerBeetleAccountCode
} = {
  [LedgerAccountType.LIQUIDITY_WALLET_ADDRESS]:
    TigerBeetleAccountCode.LIQUIDITY_WALLET_ADDRESS,
  [LedgerAccountType.LIQUIDITY_ASSET]: TigerBeetleAccountCode.LIQUIDITY_ASSET,
  [LedgerAccountType.LIQUIDITY_PEER]: TigerBeetleAccountCode.LIQUIDITY_PEER,
  [LedgerAccountType.SETTLEMENT]: TigerBeetleAccountCode.SETTLEMENT
}

export const convertFromTigerBeetleAccountType: {
  [key in TigerBeetleAccountCode]: LedgerAccountType
} = {
  [TigerBeetleAccountCode.LIQUIDITY_WALLET_ADDRESS]:
    LedgerAccountType.LIQUIDITY_WALLET_ADDRESS,
  [TigerBeetleAccountCode.LIQUIDITY_ASSET]: LedgerAccountType.LIQUIDITY_ASSET,
  [TigerBeetleAccountCode.LIQUIDITY_PEER]: LedgerAccountType.LIQUIDITY_PEER,
  [TigerBeetleAccountCode.SETTLEMENT]: LedgerAccountType.SETTLEMENT
}

export function assetCodeToUInt32(assetCode: string): number {
  const byte1 = assetCode.charCodeAt(0) << 16
  const byte2 = assetCode.charCodeAt(1) << 8
  const byte3 = assetCode.charCodeAt(2)

  return byte1 | byte2 | byte3
}

export function uint32ToAssetCode(value: number): string {
  const byte1 = (value >> 16) & 0xff
  const byte2 = (value >> 8) & 0xff
  const byte3 = value & 0xff

  return (
    String.fromCharCode(byte1) +
    String.fromCharCode(byte2) +
    String.fromCharCode(byte3)
  )
}

export function toTbId(uuid: string): bigint {
  return BigInt(`0x${uuid.replace(/-/g, '')}`)
}

export function fromTbIdToUuid(id: bigint): string {
  const hexString = id.toString(16).padStart(32, '0')

  return `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(
    12,
    16
  )}-${hexString.slice(16, 20)}-${hexString.slice(20)}`
}

export function toTbAccountFlags(account: LedgerAccount): TB.AccountFlags {
  const flags =
    account.type === LedgerAccountType.SETTLEMENT
      ? TB.AccountFlags.credits_must_not_exceed_debits
      : TB.AccountFlags.debits_must_not_exceed_credits

  return flags
}

// check if addresses are IPs or names, resolve if names
export async function parseAndLookupReplicaAddresses(
  replicaAddress: string[],
  logger: ILogger
): Promise<string[]> {
  const replicaIpAddresses: string[] = []
  for (const addr of replicaAddress) {
    logger.debug(`Parsing addr: ${addr}`)
    const parts = addr.split(':')
    if (!parts) {
      const err = new Error(
        `Cannot parse replicaAddresses in TigerBeetleAdapter.init() - value: "${addr}"`
      )
      logger.error(err.message)
      throw err
    }
    logger.debug(`\t addr parts are: ${parts[0]} and ${parts[1]}`)

    if (net.isIP(parts[0]) === 0) {
      logger.debug('\t addr part[0] is not an IP address, looking it up..')
      await dns.promises
        .lookup(parts[0], { family: 4 })
        .then((resp) => {
          logger.debug(`\t lookup result is: ${resp.address}`)
          replicaIpAddresses.push(`${resp.address}:${parts[1]}`)
        })
        .catch((error: Error) => {
          const err = new Error(
            `Lookup error while parsing replicaAddresses in TigerBeetleAdapter.init() - cannot resolve: "${addr[0]}" of "${addr}"`
          )
          logger.error(err.message)
          throw err
        })
    } else {
      logger.debug('\t lookup not necessary, adding addr directly')
      replicaIpAddresses.push(addr)
    }
  }

  return replicaIpAddresses
}

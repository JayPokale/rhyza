/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict'

export interface ICache<T> {
  get(key: string): Promise<T | undefined>

  getKeyExpiry(key: string): Promise<number | undefined>

  set(key: string, value: T): Promise<boolean>

  delete(key: string): Promise<void>
}

export interface ICached<T> {
  expiry: number
  data: T
}

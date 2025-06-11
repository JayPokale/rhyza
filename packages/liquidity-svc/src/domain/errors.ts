/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

// should go to liquidity-types-lib / do we need this in the client???

export class DuplicateAssetAccountFoundError extends Error {}
export class DuplicatePeerAccountFoundError extends Error {}
export class AccountNotFoundError extends Error {}
export class AssetScaleTooHighError extends Error {}
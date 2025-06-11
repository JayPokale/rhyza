/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

export type LiquidityAsset = {
    id: string;
    scale: number;
    code: string;
}

export type LiquidityWalletAddress = {
    id: string;
    assetCode: string;
    assetScale: number;
}

export type WalletAddressAccount = {
    id: string;
    assetCode: string;
    assetScale: number;
    liquidityAccountId: string;
}

export enum LedgerAccountType {
    LIQUIDITY_ASSET = "LIQUIDITY_ASSET",
    LIQUIDITY_PEER = "LIQUIDITY_PEER",
    LIQUIDITY_WALLET_ADDRESS = "LIQUIDITY_WALLET_ADDRESS",
    SETTLEMENT = "SETTLEMENT",
}


export type AssetAccount = {
    id: string;
    assetCode: string;
    assetScale: number;
    settlementAccountId: string;
    liquidityAccountId: string;
    // lowLiquidityThreshold?: bigint;
    // highLiquidityThreshold?: bigint;
}

export type PeerAccount = {
    id: string;
    assetCode: string;
    assetScale: number;
    liquidityAccountId: string;
    // lowLiquidityThreshold?: bigint;
    // highLiquidityThreshold?: bigint;
}


export type LedgerAccount = {
    id: string;
    assetCode: string;
    type: LedgerAccountType;
    externalRef: string;
    readonly creditsPosted: bigint;
    readonly debitsPosted: bigint;
}

export type LedgerTransfer = {
    id: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: bigint;
    assetCode: string;
}

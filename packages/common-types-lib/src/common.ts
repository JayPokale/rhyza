/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

export type Asset = {
    //id: string;
    scale: number;
    code: string;
}

export type Amount = {
    assetCode: string;
    assetScale: number;
    value: bigint;
}


export type WalletAddress = {
    id: string;
    url: string;
    isActive: boolean;
    assetCode: string;
    assetScale: number;
}



"use strict";

export interface IAssetRepository {
    existsByCode(code: string): Promise<boolean>;
    store( id: string, scale: number, code: string): Promise<void>;
}

export interface IAssetService {
    createAsset(scale: number, code: string): Promise<string>;
}


// Errors, if many move to own file
export class DuplicateAssetFoundError extends Error {}
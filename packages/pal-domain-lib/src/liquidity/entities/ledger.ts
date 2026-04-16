export interface ILedgerDTO {
  id: string;
  version: string;
  assetScale: number;
}

export interface ILedger {
  id: string;
  version: bigint;
  assetScale: number;
}


export class LedgerDtoSerializer {
  static toDTO(ledger:ILedger):ILedgerDTO{
    return {
      id: ledger.id,
      assetScale: ledger.assetScale,
      version: ledger.version.toString()
    }
  }
  static fromDTO(dto:ILedgerDTO):ILedger{
    return {
      id: dto.id,
      assetScale: dto.assetScale,
      version: BigInt(dto.version)
    }
  }
}

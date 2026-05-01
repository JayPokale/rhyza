export interface ILedgerDTO {
  id: string;
  version: string;
  assetScale: number;
}

export interface ILedgerAccountDTO {
  id: string;
  name: string;
  assetCode: string;
  assetDisplayScale: number;
  debitedAmount: string;
  creditedAmount: string;
}

export interface ILedgerTransactionDTO {
  id: string;
  debitedAccountId: string;
  creditedAccountId: string;
  amount: string;
  amountScale: number;
  timestamp: number;
  externalId?: string;
}

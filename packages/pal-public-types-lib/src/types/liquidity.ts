export interface ILedgerDto {
  id: string;
  version: string;
  assetScale: number;
}

// must align with ILedgerAccount in domain

export interface ILedgerAccountDto {
  id: string;
  type:
    | 'ASSET_LIQUIDITY_ACCOUNT'
    | 'PEER_LIQUIDITY_ACCOUNT'
    | 'PEER_CLEARING_ACCOUNT'
    | 'ASE_LIQUIDITY_ACCOUNT'
    | 'ASE_CLEARING_ACCOUNT'
    | 'SUSPENSE_ACCOUNT';
  name: string;
  assetCode: string;
  assetDisplayScale: number;
  debitedAmount: string;
  creditedAmount: string;
  // for a peer account this is the peer id
  peerId?: string;
}

// must align with ILedgerTransaction in domain
export interface ILedgerTransactionDto {
  id: string;
  debitedAccountId: string;
  creditedAccountId: string;
  amount: string;
  amountScale: number;
  timestamp: number;
  // external transaction id passed in by clients
  externalId?: string;
}

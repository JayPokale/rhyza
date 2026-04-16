import {ILedger, ILedgerAccount, ILedgerTransaction} from "pal-domain-lib";

export interface ILedgerReadSideRepository {
  storeLedgers(ledgers: ILedger[]): Promise<void>;
  fetchLedgers(ids: string[]): Promise<ILedger[]>;

  storeLedgerAccounts(accounts: ILedgerAccount[]): Promise<void>;
  fetchLedgerAccounts(ids: string[]): Promise<ILedgerAccount[]>;

  storeLedgerTransactions(transactions: ILedgerTransaction[]): Promise<void>;
  fetchLedgerTransactions(ids: string[]): Promise<ILedgerTransaction[]>;
}

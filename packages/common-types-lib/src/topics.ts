// public domain events
export enum DomainEventTopics {
  'PaymentEvents' = 'payment-domain-events',
  'LedgerEvents' = 'ledger-domain-events',
  'AssetEvents' = 'asset-domain-events',
  'WalletAddressEvents' = 'wallet-address-domain-events'
}

// TODO pedro: not sure we should keep commands in the common types lib,
// maybe they should be private to the BC libs
export enum CommandTopics {
  'PaymentCommands' = 'payment-commands',
  'LedgerCommands' = 'ledger-commands',
  'AssetCommands' = 'asset-commands'
}

// for private event-sourcing events
export enum StateEventTopics {
  'LedgerStateEvents' = 'ledger-state-events'
}

// for private event-sourcing snapshot events
export enum SnapshotEventTopics {
  'LedgerSnapshotEvents' = 'ledger-snapshot-events'
}


import { beforeEach, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  MockLedgerEventSourcingRepository,
  MockMessageProducer,
  MockTelemetryService
} from './mocks/';

import {
  CheckBalanceAndReserveTransferCmd,
  CommitTransferCmd,
  CreateLedgerAccountForAssetCmd,
  CreateLedgerAccountsForPeerCmd,
  CreateLedgerCmd,
  DepositToAseCmd,
  DepositToPeerCmd,
  IPalPeerAccounts,
  LedgerAccountsCreatedStateEvent,
  LedgerAccountsCreatedStatePayload,
  LedgerAggregate,
  LedgerCommand,
  LedgerCreatedStateEvent,
  LedgerTransactionRecordedStateEvent,
  RejectTransferCmd,
  ReserveTransferCmd,
  WithdrawFromAseCmd,
  WithdrawFromPeerCmd
} from '../src';
import { ConsoleLogger, DomainEvent } from 'common-types-lib';
import {
  LedgerAccountsCreatedForPeerEvent,
  LedgerOutgoingTransferCommittedEvent,
  LedgerOutgoingTransferInsufficientFundsErrorEvent,
  LedgerOutgoingTransferRejectedEvent,
  LedgerOutgoingTransferReservedEvent,
  LedgerIncomingTransferReservedEvent,
  LedgerIncomingTransferInsufficientFundsErrorEvent,
  LedgerIncomingTransferRejectedEvent,
  LedgerDepositToAseSucceededEvent,
  LedgerDepositToPeerSucceededEvent,
  LedgerIncomingTransferCommittedEvent,
  LedgerWithdrawFromAseSucceededEvent,
  LedgerWithdrawFromPeerSucceededEvent,
  LedgerWithdrawFromAseFailedWithInsufficientFundsEvent,
  LedgerWithdrawFromPeerFailedWithInsufficientFundsEvent,
  LedgerAccountCreatedForAssetEvent
} from 'pal-public-types-lib';

let mockRepo: MockLedgerEventSourcingRepository;
let mockProducer: MockMessageProducer;
let aggregate: LedgerAggregate;

let aggExpectedVersion = 0;

const EUR_LEDGER_ID = 'EUR';
const PEER_ONE_ID = 'peer1';
const AMOUNT = BigInt(1000);
const DEPOSIT_AMOUNT = AMOUNT * BigInt(5);
const AMOUNT_SCALE = 2;

const assetSystemAccId = crypto.randomUUID();

const peerOneAccounts: IPalPeerAccounts = {
  peerLiquidityAccId: 'peerLiquidityAccId',
  peerClearingAccId: 'peerClearingAccId',
  aseLiquidityAccId: 'aseLiquidityAccId',
  aseClearingAccId: 'aseClearingAccId',
  suspenseAccId: 'suspenseAccId'
};

const peerOneAccountsIdList = Object.values(peerOneAccounts);

function assertAccountsBalances(
  requiredBalances: {
    accId: string;
    debitedBalance: bigint;
    creditedBalance: bigint;
  }[]
) {
  const accounts = aggregate.getAccounts([
    ...peerOneAccountsIdList,
    assetSystemAccId
  ]);
  requiredBalances.forEach((reqBalanceItem) => {
    const account = accounts.find((acc) => acc.id === reqBalanceItem.accId);
    assert.ok(account);
    assert.equal(account.debitedAmount, reqBalanceItem.debitedBalance);
    assert.equal(account.creditedAmount, reqBalanceItem.creditedBalance);
  });
}

beforeEach(() => {
  mockRepo = new MockLedgerEventSourcingRepository();
  mockProducer = new MockMessageProducer();
  aggregate = new LedgerAggregate(
    mockRepo,
    mockProducer,
    new ConsoleLogger(),
    new MockTelemetryService()
  );

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain LowLevel API - Create ledger', async () => {
  const cmd: LedgerCommand = new CreateLedgerCmd({ id: EUR_LEDGER_ID });

  await aggregate.processCommands(cmd);

  const stateEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  const lastStateEvent = stateEvents[stateEvents.length - 1];
  assert.ok(lastStateEvent);
  assert.equal(lastStateEvent.msgName, LedgerCreatedStateEvent.name);
  assert.equal(lastStateEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(
    lastStateEvent.aggregateVersion,
    (++aggExpectedVersion).toString()
  );

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain LowLevel API - Create ledger account for asset', async () => {
  // run setup commands
  await aggregate.processCommands([new CreateLedgerCmd({ id: EUR_LEDGER_ID })]);

  // run test

  const cmd = new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
    id: assetSystemAccId,
    assetCode: EUR_LEDGER_ID
  });

  await aggregate.processCommands(cmd);

  const stateEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  const lastStateEvent = stateEvents.at(-1) as LedgerAccountsCreatedStateEvent;

  assert.ok(lastStateEvent);
  assert.equal(lastStateEvent.msgName, LedgerAccountsCreatedStateEvent.name);
  assert.equal(lastStateEvent.aggregateId, EUR_LEDGER_ID);
  assert.ok(lastStateEvent.payload.accounts);
  assert.equal(lastStateEvent.payload.accounts[0].assetCode, EUR_LEDGER_ID);
  assert.equal(lastStateEvent.payload.accounts[0].id, assetSystemAccId);

  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.ok(lastDomainEvent);
  assert.equal(lastDomainEvent.msgName, LedgerAccountCreatedForAssetEvent.name);
  const fetchedAccounts = aggregate.getAccounts([assetSystemAccId]);
  assert.ok(fetchedAccounts.length === 1);
  assert.ok(fetchedAccounts[0].id === assetSystemAccId);

  assert.equal(
    lastStateEvent.aggregateVersion,
    (++aggExpectedVersion).toString()
  );
  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain LowLevel API - Create ledger accounts for peer one', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    })
  ]);

  // run test

  const cmd = new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
    ...peerOneAccounts,
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID
  });

  await aggregate.processCommands(cmd);

  const stateEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  const lastStateEvent = stateEvents.at(-1);
  assert.ok(lastStateEvent);

  assert.equal(
    lastStateEvent.aggregateVersion,
    (++aggExpectedVersion).toString()
  );

  assert.equal(lastStateEvent.msgName, LedgerAccountsCreatedStateEvent.name);
  assert.equal(lastStateEvent.aggregateId, EUR_LEDGER_ID);
  const payload = lastStateEvent.payload as LedgerAccountsCreatedStatePayload;

  assert.ok(payload.accounts);
  const payloadAccounts = payload.accounts;
  assert.ok(payloadAccounts.length == 5);

  // get the accounts from the aggregate
  const fetchedAccounts = aggregate.getAccounts(peerOneAccountsIdList);
  peerOneAccountsIdList.forEach((id) => {
    const payloadAccount = payloadAccounts.find((acc) => acc.id === id);
    assert.ok(payloadAccount);
    const fetchedAccount = fetchedAccounts.find((acc) => acc.id === id);
    assert.ok(fetchedAccount);

    assert.ok(payloadAccount.name.includes(PEER_ONE_ID));
    assert.equal(payloadAccount.assetCode, EUR_LEDGER_ID);
    assert.equal(payloadAccount.assetDisplayScale, AMOUNT_SCALE);
    assert.equal(payloadAccount.debitedAmount, '0');
    assert.equal(payloadAccount.creditedAmount, '0');

    assert.equal(payloadAccount.name, fetchedAccount.name);
    assert.equal(payloadAccount.assetCode, fetchedAccount.assetCode);
    assert.equal(
      payloadAccount.assetDisplayScale,
      fetchedAccount.assetDisplayScale
    );
    assert.equal(
      payloadAccount.debitedAmount,
      fetchedAccount.debitedAmount.toString()
    );
    assert.equal(
      payloadAccount.creditedAmount,
      fetchedAccount.creditedAmount.toString()
    );
  });

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(
    -1
  ) as LedgerAccountsCreatedForPeerEvent;
  assert.equal(lastDomainEvent.msgName, LedgerAccountsCreatedForPeerEvent.name);
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);

  assert.ok(aggregate.verify());
});

/*
 * High Level API Calls
 * */
test('PAL Ledger Domain HighLevel API - Outgoing - Check Balance And Reserve Transfer cmd should fail before deposit', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    })
  ]);

  // run test

  const cmd: CheckBalanceAndReserveTransferCmd =
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req1',
      transferId: '1',
      peerId: PEER_ONE_ID,
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      transferDirection: 'OUTGOING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    });

  await aggregate.processCommands(cmd);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerOutgoingTransferInsufficientFundsErrorEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.isErrorEvent, true);
  assert.equal(lastDomainEvent.payload.requestId, 'req1');
  assert.equal(lastDomainEvent.payload.transferId, '1');
  assert.equal(lastDomainEvent.payload.paymentId, 'payment-1');
  assert.equal(lastDomainEvent.payload.paymentIntentId, 'intent-1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Deposit ASE liquidity', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    })
  ]);

  // run test
  const cmd: DepositToAseCmd = new DepositToAseCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: DEPOSIT_AMOUNT.toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(lastDomainEvent.msgName, LedgerDepositToAseSucceededEvent.name);
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Check Balance And Reserve Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const reqId = 'req1';
  const txId = '1';
  const cmd: CheckBalanceAndReserveTransferCmd =
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: reqId,
      transferId: txId,
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'OUTGOING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerOutgoingTransferReservedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, txId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Commit Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    }),
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req-1',
      transferId: 'txId',
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'OUTGOING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    })
  ]);

  // run test
  const reqId = 'req1';
  const transferId = '1';

  const cmd: CommitTransferCmd = new CommitTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: transferId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'OUTGOING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerOutgoingTransferCommittedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, transferId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: AMOUNT * 2n,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Reject Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    }),
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req1',
      transferId: '1',
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'OUTGOING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    })
  ]);

  // run test
  const reqId = 'req1';
  const transferId = '1';
  const cmd: RejectTransferCmd = new RejectTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: transferId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'OUTGOING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerOutgoingTransferRejectedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, transferId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    }
  ]);
  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Reserve Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test

  const reqId = 'req3';
  const transferId = '1';
  const cmd: ReserveTransferCmd = new ReserveTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: transferId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'OUTGOING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerOutgoingTransferReservedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, transferId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    }
  ]);
  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Withdraw ASE liquidity', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const cmd = new WithdrawFromAseCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: DEPOSIT_AMOUNT.toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerWithdrawFromAseSucceededEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Outgoing - Withdraw ASE liquidity in excess should fail', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    new DepositToAseCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const cmd = new WithdrawFromAseCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: (DEPOSIT_AMOUNT + 1n).toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerWithdrawFromAseFailedWithInsufficientFundsEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Check Balance And Reserve Transfer cmd should fail before deposit', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    })
  ]);

  // run test
  const cmd: CheckBalanceAndReserveTransferCmd =
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req1',
      transferId: '1',
      amount: (DEPOSIT_AMOUNT * 2n).toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'INCOMING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    });

  await aggregate.processCommands(cmd);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerIncomingTransferInsufficientFundsErrorEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.isErrorEvent, true);
  assert.equal(lastDomainEvent.payload.requestId, 'req1');
  assert.equal(lastDomainEvent.payload.transferId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    { accId: assetSystemAccId, debitedBalance: 0n, creditedBalance: 0n },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);
  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Deposit Peer liquidity', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    })
  ]);

  // run test
  const cmd: DepositToPeerCmd = new DepositToPeerCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: DEPOSIT_AMOUNT.toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(lastDomainEvent.msgName, LedgerDepositToPeerSucceededEvent.name);
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Check Balance And Reserve Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const cmd: CheckBalanceAndReserveTransferCmd =
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req2',
      transferId: '1',
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'INCOMING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    });

  await aggregate.processCommands(cmd);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerIncomingTransferReservedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.requestId, 'req2');
  assert.equal(lastDomainEvent.payload.transferId, '1');
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Commit Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    }),
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req-1',
      transferId: 'txId',
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'INCOMING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    })
  ]);

  // run test
  const reqId = 'req1';
  const transferId = '1';

  const cmd: CommitTransferCmd = new CommitTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: transferId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'INCOMING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerIncomingTransferCommittedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, transferId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: AMOUNT * 2n,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Reject Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    }),
    new CheckBalanceAndReserveTransferCmd(EUR_LEDGER_ID, {
      requestId: 'req2',
      transferId: '1',
      amount: AMOUNT.toString(),
      amountScale: AMOUNT_SCALE,
      peerId: PEER_ONE_ID,
      transferDirection: 'INCOMING',
      paymentIntentId: 'intent-1',
      paymentId: 'payment-1'
    })
  ]);

  // run test

  const reqId = 'req1';
  const txId = '1';
  const cmd: RejectTransferCmd = new RejectTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: txId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'INCOMING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerIncomingTransferRejectedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, txId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: AMOUNT,
      creditedBalance: AMOUNT
    }
  ]);
});

test('PAL Ledger Domain HighLevel API - Incoming - Reserve Transfer', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    // deposit
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const reqId = 'req3';
  const txId = '1';
  const cmd: ReserveTransferCmd = new ReserveTransferCmd(EUR_LEDGER_ID, {
    requestId: reqId,
    transferId: txId,
    amount: AMOUNT.toString(),
    amountScale: AMOUNT_SCALE,
    peerId: PEER_ONE_ID,
    transferDirection: 'INCOMING',
    paymentIntentId: 'intent-1',
    paymentId: 'payment-1'
  });

  await aggregate.processCommands(cmd);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages.at(-1) as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerIncomingTransferReservedEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.requestId, reqId);
  assert.equal(lastDomainEvent.payload.requestId, reqId);
  assert.equal(lastDomainEvent.payload.transferId, txId);
  assert.equal(lastDomainEvent.payload.isError, undefined);

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: AMOUNT
    }
  ]);
});

test('PAL Ledger Domain HighLevel API - Incoming - Withdraw Peer liquidity', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const cmd = new WithdrawFromPeerCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: DEPOSIT_AMOUNT.toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerWithdrawFromPeerSucceededEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

test('PAL Ledger Domain HighLevel API - Incoming - Withdraw Peer liquidity in excess should fail', async () => {
  // run setup commands
  await aggregate.processCommands([
    new CreateLedgerCmd({ id: EUR_LEDGER_ID }),
    new CreateLedgerAccountForAssetCmd(EUR_LEDGER_ID, {
      id: assetSystemAccId,
      assetCode: EUR_LEDGER_ID
    }),
    new CreateLedgerAccountsForPeerCmd(EUR_LEDGER_ID, {
      ...peerOneAccounts,
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID
    }),
    new DepositToPeerCmd({
      requestId: '1',
      peerId: PEER_ONE_ID,
      assetCode: EUR_LEDGER_ID,
      amount: DEPOSIT_AMOUNT.toString(),
      amountScale: AMOUNT_SCALE
    })
  ]);

  // run test
  const cmd = new WithdrawFromPeerCmd({
    requestId: '1',
    peerId: PEER_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    amount: (DEPOSIT_AMOUNT + 1n).toString(),
    amountScale: AMOUNT_SCALE
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(
    lastEvents[lastEvents.length - 1].msgName,
    LedgerTransactionRecordedStateEvent.name
  );
  assert.equal(lastEvents[lastEvents.length - 1].aggregateId, EUR_LEDGER_ID);

  // check domain/integration events
  const lastDomainEvent = mockProducer.messages[
    mockProducer.messages.length - 1
  ] as DomainEvent;
  assert.equal(
    lastDomainEvent.msgName,
    LedgerWithdrawFromPeerFailedWithInsufficientFundsEvent.name
  );
  assert.equal(lastDomainEvent.aggregateId, EUR_LEDGER_ID);
  assert.equal(lastDomainEvent.payload.peerId, PEER_ONE_ID);
  assert.equal(lastDomainEvent.payload.requestId, '1');

  // verify accounts' balances
  assertAccountsBalances([
    {
      accId: assetSystemAccId,
      debitedBalance: DEPOSIT_AMOUNT,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.aseClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.peerLiquidityAccId,
      debitedBalance: 0n,
      creditedBalance: DEPOSIT_AMOUNT
    },
    {
      accId: peerOneAccounts.peerClearingAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    },
    {
      accId: peerOneAccounts.suspenseAccId,
      debitedBalance: 0n,
      creditedBalance: 0n
    }
  ]);

  assert.ok(aggregate.verify());
});

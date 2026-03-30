import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {MockLedgerEventSourcingRepository} from "./mocks/mock-ledger-es-repo";

import {
  CheckBalanceAndReserveCmd, CommitTransferCmd,
  CreateLedgerAccountCmd, CreateLedgerCmd,
  LedgerAccountCreatedStateEvent, LedgerAccountCreatedStatePayload, LedgerAggregate, LedgerCreatedStateEvent,
  LedgerTransactionRecordedStateEvent, LedgerTransactionRecordedStatePayload,
  PostTransactionCmd
} from "../src";
import { ConsoleLogger } from "common-types-lib";

let mockRepo:MockLedgerEventSourcingRepository;
let aggregate:LedgerAggregate;

const EUR_LEDGER_ID = "EUR";
const EUR_ACCOUNT_ONE_ID = "pedro";
const EUR_ACCOUNT_TWO_ID = "elsa";

before(() => {
  mockRepo = new MockLedgerEventSourcingRepository();
  aggregate = new LedgerAggregate(mockRepo, new ConsoleLogger());
  assert.ok(aggregate.verify());
});

test("PAL Ledger - create ledger", async () => {
  const cmd: CreateLedgerCmd = new CreateLedgerCmd({id: EUR_LEDGER_ID});

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerCreatedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);
  assert.equal(lastEvents[lastEvents.length-1].aggregateVersion, "1");

  assert.ok(aggregate.verify());
});


test("PAL Ledger - create account", async () => {
  const cmd: CreateLedgerAccountCmd = new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_ACCOUNT_ONE_ID,
    name: EUR_ACCOUNT_ONE_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerAccountCreatedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);
  const payload = lastEvents[lastEvents.length-1].payload as LedgerAccountCreatedStatePayload;

  assert.ok(payload.account);
  assert.equal(payload.account.id, EUR_ACCOUNT_ONE_ID);
  assert.equal(payload.account.name, EUR_ACCOUNT_ONE_ID);
  assert.equal(payload.account.assetCode, EUR_LEDGER_ID);
  assert.equal(payload.account.assetDisplayScale, 2);

  assert.equal(lastEvents[lastEvents.length-1].aggregateVersion, "2");

  const acc = aggregate.getAccounts([EUR_ACCOUNT_ONE_ID]);
  assert.ok(acc);
  assert.equal(acc.length, 1);
  assert.equal(acc[0].id, EUR_ACCOUNT_ONE_ID);
  assert.equal(acc[0].creditedAmount, BigInt(0));
  assert.equal(acc[0].debitedAmount, BigInt(0));

  assert.ok(aggregate.verify());
});


test("PAL Ledger - create a second account", async () => {
  const cmd: CreateLedgerAccountCmd = new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_ACCOUNT_TWO_ID,
    name: EUR_ACCOUNT_TWO_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerAccountCreatedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);
  const payload = lastEvents[lastEvents.length-1].payload as LedgerAccountCreatedStatePayload;

  assert.ok(payload.account);
  assert.equal(payload.account.id, EUR_ACCOUNT_TWO_ID);
  assert.equal(payload.account.name, EUR_ACCOUNT_TWO_ID);
  assert.equal(payload.account.assetCode, EUR_LEDGER_ID);
  assert.equal(payload.account.assetDisplayScale, 2);

  assert.equal(lastEvents[lastEvents.length-1].aggregateVersion, "3");

  const acc = aggregate.getAccounts([EUR_ACCOUNT_TWO_ID]);
  assert.ok(acc);
  assert.equal(acc.length, 1);
  assert.equal(acc[0].id, EUR_ACCOUNT_TWO_ID);
  assert.equal(acc[0].creditedAmount, BigInt(0));
  assert.equal(acc[0].debitedAmount, BigInt(0));

  assert.ok(aggregate.verify());
});


test("PAL Ledger - post transaction", async () => {
  const cmd: PostTransactionCmd = new PostTransactionCmd(EUR_LEDGER_ID, {
    id: "1",
    amount: "123",
    amountScale: 2,
    debitedAccountId: EUR_ACCOUNT_ONE_ID,
    creditedAccountId: EUR_ACCOUNT_TWO_ID
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  assert.equal(lastEvents[lastEvents.length-1].aggregateVersion, "4");

  const payload = lastEvents[lastEvents.length-1].payload as LedgerTransactionRecordedStatePayload;
  assert.ok(payload);
  assert.equal(payload.transaction.id, "1");
  assert.equal(payload.transaction.amount, "123");
  assert.equal(payload.transaction.amountScale, 2);
  assert.equal(payload.transaction.debitedAccountId, EUR_ACCOUNT_ONE_ID);
  assert.equal(payload.transaction.creditedAccountId, EUR_ACCOUNT_TWO_ID);

  const [debitedAcc, creditedAcc] = aggregate.getAccounts([EUR_ACCOUNT_ONE_ID, EUR_ACCOUNT_TWO_ID]);
  assert.ok(debitedAcc);
  assert.ok(creditedAcc);

  assert.equal(debitedAcc.id, EUR_ACCOUNT_ONE_ID);
  assert.equal(creditedAcc.id, EUR_ACCOUNT_TWO_ID);
  assert.equal(debitedAcc.creditedAmount, BigInt(0));
  assert.equal(debitedAcc.debitedAmount, BigInt(123));
  assert.equal(creditedAcc.creditedAmount, BigInt(123));
  assert.equal(creditedAcc.debitedAmount, BigInt(0));

  assert.ok(aggregate.verify());
});

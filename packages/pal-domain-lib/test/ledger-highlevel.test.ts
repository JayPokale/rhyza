import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {MockLedgerEventSourcingRepository} from "./mocks/mock-ledger-es-repo";

import {
  CheckBalanceAndReserveCmd, CommitTransferCmd,
  CreateLedgerAccountCmd, CreateLedgerCmd, InsufficientFundsError,
  LedgerAccountCreatedStateEvent, LedgerAccountCreatedStatePayload, LedgerAggregate, LedgerCreatedStateEvent,
  LedgerTransactionRecordedStateEvent, LedgerTransactionRecordedStatePayload,
  PostTransactionCmd, RejectTransferCmd, ReserveTransferCmd,
} from "../src";
import { ConsoleLogger } from "common-types-lib";

let mockRepo:MockLedgerEventSourcingRepository;
let aggregate:LedgerAggregate;

const EUR_LEDGER_ID = "EUR";

const EUR_PAYER_CLEARING_ACCOUNT_ID = "payer_clearing";
const EUR_PAYER_LIQUIDITY_ACCOUNT_ID = "payer_liquidity";
const EUR_PAYEE_CLEARING_ACCOUNT_ID = "payee_clearing";
const EUR_SUSPENSE_ACCOUNT_ID = "suspense";
const EUR_CASH_ACCOUNT_ID = "cash";

const AMOUNT = BigInt(1000);

before(() => {
  mockRepo = new MockLedgerEventSourcingRepository();
  aggregate = new LedgerAggregate(mockRepo, new ConsoleLogger());

  assert.ok(aggregate.verify());
});

test("PAL Ledger HighLevel API - Create ledger", async () => {
  const cmd: CreateLedgerCmd = new CreateLedgerCmd({id: EUR_LEDGER_ID});

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerCreatedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);
  assert.equal(lastEvents[lastEvents.length-1].aggregateVersion, "1");
});

test("PAL Ledger HighLevel API - Create accounts", async () => {
  const cmds: CreateLedgerAccountCmd[] = [];
  cmds.push(new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_PAYER_CLEARING_ACCOUNT_ID,
    name: EUR_PAYER_CLEARING_ACCOUNT_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  }));
  cmds.push(new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    name: EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  }));
  cmds.push(new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_PAYEE_CLEARING_ACCOUNT_ID,
    name: EUR_PAYEE_CLEARING_ACCOUNT_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  }));
  cmds.push(new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_SUSPENSE_ACCOUNT_ID,
    name: EUR_SUSPENSE_ACCOUNT_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  }));
  cmds.push(new CreateLedgerAccountCmd(EUR_LEDGER_ID, {
    id: EUR_CASH_ACCOUNT_ID,
    name: EUR_CASH_ACCOUNT_ID,
    assetCode: EUR_LEDGER_ID,
    assetDisplayScale: 2
  }));

  await aggregate.processCommands(cmds);

  const accounts = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    EUR_PAYEE_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID,
    EUR_CASH_ACCOUNT_ID
  ]);

  assert.ok(accounts);
  assert.equal(accounts.length, 5);
  assert.equal(accounts[0].id, EUR_PAYER_CLEARING_ACCOUNT_ID);
  assert.equal(accounts[1].id, EUR_PAYER_LIQUIDITY_ACCOUNT_ID);
  assert.equal(accounts[2].id, EUR_PAYEE_CLEARING_ACCOUNT_ID);
  assert.equal(accounts[3].id, EUR_SUSPENSE_ACCOUNT_ID);
  assert.equal(accounts[4].id, EUR_CASH_ACCOUNT_ID);

  assert.ok(aggregate.verify());
});



test("PAL Ledger HighLevel API - CheckBalanceAndReserveCmd should fail before deposit", async () => {
  const cmd: CheckBalanceAndReserveCmd = new CheckBalanceAndReserveCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    payerLiquidityAccountId: EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID
  });

  try{
    await aggregate.processCommands(cmd);
    assert.fail("Should have failed");
  }catch(e) {
    assert.ok(e);
    assert.ok(e instanceof InsufficientFundsError);

    assert.ok(aggregate.verify());
  }
});


test("PAL Ledger HighLevel API - Deposit payer liquidity", async () => {
  const depositAmount = AMOUNT * BigInt(5);
  const cmd: PostTransactionCmd = new PostTransactionCmd(EUR_LEDGER_ID, {
    id: "1",
    amount: depositAmount.toString(),
    amountScale: 2,
    debitedAccountId: EUR_CASH_ACCOUNT_ID,
    creditedAccountId: EUR_PAYER_LIQUIDITY_ACCOUNT_ID
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);


  const [cashAcc, payerLiqAcc] = aggregate.getAccounts([EUR_CASH_ACCOUNT_ID, EUR_PAYER_LIQUIDITY_ACCOUNT_ID]);
  assert.ok(cashAcc);
  assert.equal(cashAcc.id, EUR_CASH_ACCOUNT_ID);
  assert.ok(payerLiqAcc);
  assert.equal(payerLiqAcc.id, EUR_PAYER_LIQUIDITY_ACCOUNT_ID);

  assert.equal(cashAcc.debitedAmount, depositAmount);
  assert.equal(cashAcc.creditedAmount, BigInt(0));
  assert.equal(payerLiqAcc.debitedAmount, BigInt(0));
  assert.equal(payerLiqAcc.creditedAmount, depositAmount);

  assert.ok(aggregate.verify());
});


test("PAL Ledger HighLevel API - CheckBalanceAndReserve", async () => {
  const cmd: CheckBalanceAndReserveCmd = new CheckBalanceAndReserveCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    payerLiquidityAccountId: EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID
  });


  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  const [payer_clearing, suspense] = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID
  ]);

  assert.ok(payer_clearing);
  assert.equal(payer_clearing.id, EUR_PAYER_CLEARING_ACCOUNT_ID);

  assert.ok(suspense);
  assert.equal(suspense.id, EUR_SUSPENSE_ACCOUNT_ID);

  assert.equal(payer_clearing.debitedAmount, AMOUNT);
  assert.equal(payer_clearing.creditedAmount, BigInt(0));

  assert.equal(suspense.debitedAmount, BigInt(0));
  assert.equal(suspense.creditedAmount, AMOUNT);

  assert.ok(aggregate.verify());
});

test("PAL Ledger HighLevel API - Commit transfer", async () => {
  const cmd: CommitTransferCmd = new CommitTransferCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID,
    payeeClearingAccountId: EUR_PAYEE_CLEARING_ACCOUNT_ID,
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  const [payer_clearing, suspense, payee_clearing] = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID,
    EUR_PAYEE_CLEARING_ACCOUNT_ID
  ]);

  assert.ok(payer_clearing);
  assert.equal(payer_clearing.id, EUR_PAYER_CLEARING_ACCOUNT_ID);

  assert.ok(suspense);
  assert.equal(suspense.id, EUR_SUSPENSE_ACCOUNT_ID);

  assert.ok(payee_clearing);
  assert.equal(payee_clearing.id, EUR_PAYEE_CLEARING_ACCOUNT_ID);

  assert.equal(payer_clearing.debitedAmount, AMOUNT * BigInt(2)); //debited went up by amount twice
  assert.equal(payer_clearing.creditedAmount, AMOUNT); //credited went up by amount once

  assert.equal(suspense.debitedAmount, AMOUNT);
  assert.equal(suspense.creditedAmount, AMOUNT);

  assert.equal(payee_clearing.debitedAmount, BigInt(0));
  assert.equal(payee_clearing.creditedAmount, AMOUNT);

  assert.ok(aggregate.verify());
});


test("PAL Ledger HighLevel API - CheckBalanceAndReserve transfer to reject", async () => {
  const cmd: CheckBalanceAndReserveCmd = new CheckBalanceAndReserveCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    payerLiquidityAccountId: EUR_PAYER_LIQUIDITY_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID
  });


  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  const [payer_clearing, suspense] = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID
  ]);

  assert.ok(payer_clearing);
  assert.equal(payer_clearing.id, EUR_PAYER_CLEARING_ACCOUNT_ID);

  assert.ok(suspense);
  assert.equal(suspense.id, EUR_SUSPENSE_ACCOUNT_ID);

  assert.equal(payer_clearing.debitedAmount, AMOUNT * BigInt(3));
  assert.equal(payer_clearing.creditedAmount, AMOUNT * BigInt(1));

  assert.equal(suspense.debitedAmount, AMOUNT * BigInt(1));
  assert.equal(suspense.creditedAmount, AMOUNT * BigInt(2));

  assert.ok(aggregate.verify());
});

test("PAL Ledger HighLevel API - Reject transfer", async () => {
  const cmd: RejectTransferCmd = new RejectTransferCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID
  });

  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  const [payer_clearing, suspense, payee_clearing] = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID,
    EUR_PAYEE_CLEARING_ACCOUNT_ID
  ]);

  assert.ok(payer_clearing);
  assert.equal(payer_clearing.id, EUR_PAYER_CLEARING_ACCOUNT_ID);

  assert.ok(suspense);
  assert.equal(suspense.id, EUR_SUSPENSE_ACCOUNT_ID);

  assert.ok(payee_clearing);
  assert.equal(payee_clearing.id, EUR_PAYEE_CLEARING_ACCOUNT_ID);

  assert.equal(payer_clearing.debitedAmount, AMOUNT * BigInt(3)); //debited went up 3 times
  assert.equal(payer_clearing.creditedAmount, AMOUNT * BigInt(2)); //credited went up 2 times

  assert.equal(suspense.debitedAmount, AMOUNT * BigInt(2)); //credited went up 2 times
  assert.equal(suspense.creditedAmount, AMOUNT * BigInt(2)); //credited went up 2 times

  assert.equal(payee_clearing.debitedAmount, BigInt(0)); // still the same
  assert.equal(payee_clearing.creditedAmount, AMOUNT); // still the same

  assert.ok(aggregate.verify());
});



test("PAL Ledger HighLevel API - ReserveTransfer", async () => {
  const cmd: ReserveTransferCmd = new ReserveTransferCmd(EUR_LEDGER_ID, {
    requestId: "req1",
    transactionId: "1",
    amount: AMOUNT.toString(),
    amountScale: 2,
    payerClearingAccountId: EUR_PAYER_CLEARING_ACCOUNT_ID,
    suspenseAccountId: EUR_SUSPENSE_ACCOUNT_ID
  });


  await aggregate.processCommands(cmd);

  const lastEvents = await mockRepo.fetchStateEvents(EUR_LEDGER_ID);
  assert.ok(lastEvents.length > 0);
  assert.equal(lastEvents[lastEvents.length-1].msgName, LedgerTransactionRecordedStateEvent.name);
  assert.equal(lastEvents[lastEvents.length-1].aggregateId, EUR_LEDGER_ID);

  const [payer_clearing, suspense, payee_clearing] = aggregate.getAccounts([
    EUR_PAYER_CLEARING_ACCOUNT_ID,
    EUR_SUSPENSE_ACCOUNT_ID,
    EUR_PAYEE_CLEARING_ACCOUNT_ID
  ]);

  assert.ok(payer_clearing);
  assert.equal(payer_clearing.id, EUR_PAYER_CLEARING_ACCOUNT_ID);

  assert.ok(suspense);
  assert.equal(suspense.id, EUR_SUSPENSE_ACCOUNT_ID);

  assert.ok(payee_clearing);
  assert.equal(payee_clearing.id, EUR_PAYEE_CLEARING_ACCOUNT_ID);

  assert.equal(payer_clearing.debitedAmount, AMOUNT * BigInt(4)); //debited went up 4 times
  assert.equal(payer_clearing.creditedAmount, AMOUNT * BigInt(2)); //credited went up 2 times

  assert.equal(suspense.debitedAmount, AMOUNT * BigInt(2)); //credited went up 2 times
  assert.equal(suspense.creditedAmount, AMOUNT * BigInt(3)); //credited went up 3 times

  assert.equal(payee_clearing.debitedAmount, BigInt(0)); // still the same
  assert.equal(payee_clearing.creditedAmount, AMOUNT); // still the same

  assert.ok(aggregate.verify());
});

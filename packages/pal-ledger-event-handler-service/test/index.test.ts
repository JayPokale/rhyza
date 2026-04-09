import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {PalLedgerCommandHandlerService as Service} from '../src/service';
import {ProtoBufBaseSnapshotEventSerializer, ProtoBufBaseStateEventSerializer } from "implementations-lib";
import {KafkaLedgerEventSourcingRepository, LedgerSnapshotSerde } from "pal-implementations-lib";
import { LedgerSnapshotEvent, LedgerCreatedStateEvent, LedgerAccountCreatedStateEvent, LedgerTransactionRecordedStateEvent } from "pal-domain-lib";



before(async () => {

  const snapshotSerde = ProtoBufBaseSnapshotEventSerializer.instance();
  snapshotSerde.addSerde(LedgerSnapshotEvent.name, new LedgerSnapshotSerde());

  const eventSerde = ProtoBufBaseStateEventSerializer.instance();
  eventSerde.addSerde(LedgerCreatedStateEvent.name, new LedgerCreatedStateEventSerde());
  eventSerde.addSerde(LedgerAccountCreatedStateEvent.name, new LedgerAccountCreatedStateEventSerde());
  eventSerde.addSerde(LedgerTransactionRecordedStateEvent.name, new LedgerTransactionRecordedStateEventSerde());

  const esRepo = new KafkaLedgerEventSourcingRepository(
    kafkaProducerCommonOptions,
    kafkaConsumerCommonOptions,
    REDIS_URL,
    snapshotSerde,
    eventSerde,
    this._logger
  );

  await Service.start(
    new ConsoleLogger(),
    esRepo
  )
});

after(async () => {
  await client.close();
});


test('pal client - create asset', async () => {
  await client.createAsset(ASSET_CODE, ASSET_SCALE, undefined, undefined);
});

import { after, before, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {PalLedgerCommandHandlerService as Service} from '../src/service';
import {ProtoBufBaseSnapshotEventSerializer, ProtoBufBaseStateEventSerializer } from "implementations-lib";
import {KafkaLedgerEventSourcingRepository, LedgerSnapshotSerde } from "pal-implementations-lib";
import { LedgerSnapshotEvent, LedgerCreatedStateEvent, LedgerAccountCreatedStateEvent, LedgerTransactionRecordedStateEvent } from "pal-domain-lib";


/*

before(async () => {

  const snapshotSerde = SnapshotEventSerializer.instance();
  snapshotSerde.setSerde(LedgerSnapshotEvent.name, new LedgerSnapshotSerde());

  const eventSerde = StateEventSerializer.instance();
  eventSerde.setSerde(LedgerCreatedStateEvent.name, new LedgerCreatedStateEventSerde());
  eventSerde.setSerde(LedgerAccountCreatedStateEvent.name, new LedgerAccountCreatedStateEventSerde());
  eventSerde.setSerde(LedgerTransactionRecordedStateEvent.name, new LedgerTransactionRecordedStateEventSerde());

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
*/

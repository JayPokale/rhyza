/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

'use strict';

import {
  LedgerSnapshotEvent, LedgerStateEvent,
} from './messages/events';

/*
repositories
*/
export interface ILedgerEventSourcingRepository {
  // for any events other than snapshot events
  publishEvents(events: LedgerStateEvent[]): Promise<void>;

  // specific for snapshot events
  publishSnapshotEvent(events: LedgerSnapshotEvent[]): Promise<void>;

  fetchLastSnapshot(aggId: string): Promise<LedgerSnapshotEvent | null>;

  fetchStateEvents(
    aggId: string,
    partitionAndOffset?: { partition: number; offset: number }
  ): Promise<LedgerStateEvent[]>;
}

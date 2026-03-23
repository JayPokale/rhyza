/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";


import {Any as PbAny} from "google-protobuf/google/protobuf/any_pb";
import { ISerdeDefinition } from "implementations-lib";
import { LedgerCreatedStatePayload } from "pal-domain-lib";
import { PbLedgerCreatedStatePayload } from "../../proto_generated";

export class LedgerCreatedStateEventSerde implements ISerdeDefinition{
    payloadPbClassName = "LedgerCreatedStateEventPayload";

    serialize(payload:LedgerCreatedStatePayload):Uint8Array{
        const typedPayload = payload as LedgerCreatedStatePayload;

        const pbPayload = new PbLedgerCreatedStatePayload();
        pbPayload.setLedgerId(typedPayload.id);
        pbPayload.setAssetScale(typedPayload.assetScale);

        return pbPayload.serializeBinary();
    }

    deserialize(pbAny:PbAny, msgName:string):LedgerCreatedStatePayload{
        const pbPayload = pbAny.unpack<PbLedgerCreatedStatePayload>(PbLedgerCreatedStatePayload.deserializeBinary, msgName);
        if(!pbPayload) throw new Error("No payload found in message");


        const payload:LedgerCreatedStatePayload = {
            id: pbPayload.getLedgerId(),
            assetScale: pbPayload.getAssetScale(),
        };

        return payload;
    }
}



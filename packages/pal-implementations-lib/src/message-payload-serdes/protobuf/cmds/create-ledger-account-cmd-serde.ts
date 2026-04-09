import {Any as PbAny} from "google-protobuf/google/protobuf/any_pb";
import {
  PbCreateLedgerAccountCmdPayload, ProtoBufBaseCommandSerializer,
} from "implementations-lib";
import {CreateLedgerAccountCmdPayload,  } from "pal-domain-lib";


export class CreateLedgerAccountCmdSerde extends ProtoBufBaseCommandSerializer<CreateLedgerAccountCmdPayload>{
  protected _payloadPbClassName = "PbCreateLedgerAccountCmdPayload";
  msgName = "CreateLedgerAccountCmd";

  protected _serializePayload(payload:CreateLedgerAccountCmdPayload):Uint8Array{
    const typedPayload = payload as CreateLedgerAccountCmdPayload;

    const pbPayload = new PbCreateLedgerAccountCmdPayload();
    pbPayload.setLedgerId(typedPayload.id);
    pbPayload.setAssetCode(typedPayload.assetCode);
    pbPayload.setAssetDisplayScale(typedPayload.assetDisplayScale);
    pbPayload.setName(typedPayload.name);

    return pbPayload.serializeBinary();
  }

  protected _deserializePayload(pbAny:PbAny, msgName:string):CreateLedgerAccountCmdPayload{
    const pbPayload = pbAny.unpack<PbCreateLedgerAccountCmdPayload>(PbCreateLedgerAccountCmdPayload.deserializeBinary, msgName);
    if(!pbPayload) throw new Error("No payload found in message");

    const payload:CreateLedgerAccountCmdPayload = {
      id: pbPayload.getLedgerId(),
      assetCode: pbPayload.getAssetCode(),
      assetDisplayScale: pbPayload.getAssetDisplayScale(),
      name: pbPayload.getName(),
    };

    return payload;
  }
}


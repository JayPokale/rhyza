import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import { ProtoBufBaseCommandSerializer } from 'implementations-lib';
import { CreateLedgerAccountsForPeerCmdPayload } from 'pal-domain-lib';
import { PbCreateLedgerAccountsForPeerCmdPayload } from '../../../proto_generated';

export class CreateLedgerAccountsForPeerCmdSerde extends ProtoBufBaseCommandSerializer<CreateLedgerAccountsForPeerCmdPayload> {
  protected _payloadPbClassName = 'PbCreateLedgerAccountsForPeerCmdPayload';
  msgName = 'CreateLedgerAccountsForPeerCmd';

  protected _serializePayload(
    payload: CreateLedgerAccountsForPeerCmdPayload
  ): Uint8Array {
    const typedPayload = payload as CreateLedgerAccountsForPeerCmdPayload;

    const pbPayload = new PbCreateLedgerAccountsForPeerCmdPayload();
    pbPayload.setPeerId(typedPayload.peerId);
    pbPayload.setAssetCode(typedPayload.assetCode);
    pbPayload.setPeerLiquidityAccountId(typedPayload.peerLiquidityAccId);
    pbPayload.setPeerClearingAccountId(typedPayload.peerClearingAccId);
    pbPayload.setFspLiquidityAccountId(typedPayload.fspLiquidityAccId);
    pbPayload.setFspClearingAccountId(typedPayload.fspClearingAccId);
    pbPayload.setSuspenseAccountId(typedPayload.suspenseAccId);
    return pbPayload.serializeBinary();
  }

  protected _deserializePayload(
    pbAny: PbAny,
    msgName: string
  ): CreateLedgerAccountsForPeerCmdPayload {
    const pbPayload = pbAny.unpack<PbCreateLedgerAccountsForPeerCmdPayload>(
      PbCreateLedgerAccountsForPeerCmdPayload.deserializeBinary,
      msgName
    );
    if (!pbPayload) throw new Error('No payload found in message');

    const payload: CreateLedgerAccountsForPeerCmdPayload = {
      peerId: pbPayload.getPeerId(),
      assetCode: pbPayload.getAssetCode(),
      peerLiquidityAccId: pbPayload.getPeerLiquidityAccountId(),
      peerClearingAccId: pbPayload.getPeerClearingAccountId(),
      fspLiquidityAccId: pbPayload.getFspLiquidityAccountId(),
      fspClearingAccId: pbPayload.getFspClearingAccountId(),
      suspenseAccId: pbPayload.getSuspenseAccountId()
    };

    return payload;
  }
}

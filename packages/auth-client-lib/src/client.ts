import * as grpc from '@grpc/grpc-js';
import { ServiceError } from '@grpc/grpc-js';
import {
  RafikiAuthClient,
  GrantRequest as PbGrantRequest,
  Grant as PbGrant,
  GetGrantRequest as PbGetGrantRequest,
  AccessLimits as PbAccessLimits,
  AccessToken as PbAccessToken,
  Interaction as PbInteraction,
  GrantRequestFinish as PbGrantRequestFinish,
  SignatureData as PbSignatureData,
  RevokeGrantResponse as PbRevokeGrantResponse,
  ContinueGrantResponse as PbContinueGrantResponse,
  RotateTokenResponse as PbRotateTokenResponse,
  RevokeTokenResponse as PbRevokeTokenResponse,
  CreateGrantResponse as PbCreateGrantResponse,
  HandleInteractionChoiceResponse as PbHandleInteractionChoiceResponse,
  AcceptInteractionRequest as PbAcceptInteractionRequest,
  RejectInteractionRequest as PbRejectInteractionRequest,
  ContinueGrantRequest as PbContinueGrantRequest,
  RevokeGrantRequest as PbRevokeGrantRequest,
  IntrospectTokenResponse as PbIntrospectTokenResponse,
  IntrospectTokenRequest as PbIntrospectTokenRequest,
  RotateTokenRequest as PbRotateTokenRequest,
  RevokeTokenRequest as PbRevokeTokenRequest,
  AccessItem as PbAccessItem,
  SubjectId as PbSubjectId
} from 'auth-public-types-lib';
import {
  AccessItem,
  AccessLimits,
  AccessTokenResult,
  ContinueGrantResult,
  CreateGrantOptions,
  CreateGrantResult,
  GetGrantResult,
  GrantFinish,
  HandleInteractionChoiceResult,
  InteractionResult,
  IntrospectTokenResult,
  RevokeGrantResult,
  RevokeTokenResult,
  RotateTokenResult,
  SignatureRequestData,
  SubjectId
} from './types';

export class AuthClient {
  private readonly _serverUrl: string;
  private readonly _grpcConnectTimeOutMs: number;
  private readonly _grpcClient: RafikiAuthClient;

  constructor(serverUrl: string, grpcConnectTimeOutMs: number = 5_000) {
    this._serverUrl = serverUrl;
    this._grpcConnectTimeOutMs = grpcConnectTimeOutMs;

    this._grpcClient = new RafikiAuthClient(
      this._serverUrl,
      grpc.credentials.createInsecure(),
      {
        'grpc.max_receive_message_length': 100 * 1024 * 1024,
        'grpc.max_send_message_length': 100 * 1024 * 1024,
        'grpc.keepalive_time_ms': 10000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.keepalive_permit_without_calls': 1
      }
    );
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline: grpc.Deadline = Date.now() + this._grpcConnectTimeOutMs;
      this._grpcClient.waitForReady(deadline, (error?: Error) => {
        if (error) return reject(error);
        return resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    this._grpcClient.close();
    return Promise.resolve();
  }

  getGrant(id: string): Promise<GetGrantResult> {
    const request = new PbGetGrantRequest();
    request.setId(id);

    return new Promise((resolve, reject) => {
      this._grpcClient.getGrant(
        request,
        (error: ServiceError | null, response: PbGrant) => {
          if (error) {
            reject(error);
          } else {
            resolve(fromPbGrant(response));
          }
        }
      );
    });
  }

  createGrant(
    client: string,
    signatureData: SignatureRequestData,
    options: CreateGrantOptions
  ): Promise<CreateGrantResult> {
    const request = new PbGrantRequest();
    if (options.access) {
      request.setAccessList(options.access.map(toPbAccessItem));
    }
    request.setClient(client);
    if (options.subjectIds) {
      request.setSubjectIdsList(options.subjectIds.map(toPbSubjectId));
    }
    if (options.finish) {
      request.setFinish(toPbGrantRequestFinish(options.finish));
    }

    const signatureDataPb = new PbSignatureData();
    signatureDataPb.setUrl(signatureData.url);
    signatureDataPb.setMethod(signatureData.method);
    signatureDataPb.setBody(signatureData.body);
    signatureDataPb.setKid(signatureData.kid);
    signatureDataPb.setHeaders(JSON.stringify(signatureData.headers));
    request.setSignatureData(signatureDataPb);

    return new Promise((resolve, reject) => {
      this._grpcClient.createGrant(
        request,
        (error: ServiceError | null, response: PbCreateGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(fromPbCreateGrantResponse(response));
          }
        }
      );
    });
  }

  continueGrant(
    id: string,
    continueId: string,
    continueToken: string,
    interactRef: string
  ): Promise<ContinueGrantResult> {
    const request = new PbContinueGrantRequest();
    request.setId(id);
    request.setContinueId(continueId);
    request.setContinueToken(continueToken);
    request.setInteractRef(interactRef);

    return new Promise((resolve, reject) => {
      this._grpcClient.continueGrant(
        request,
        (error: ServiceError | null, response: PbContinueGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(fromPbContinueGrantResponse(response));
          }
        }
      );
    });
  }

  revokeGrant(
    id: string,
    continueId: string,
    continueToken: string
  ): Promise<RevokeGrantResult> {
    const request = new PbRevokeGrantRequest();
    request.setId(id);
    request.setContinueId(continueId);
    request.setContinueToken(continueToken);

    return new Promise((resolve, reject) => {
      this._grpcClient.revokeGrant(
        request,
        (error: ServiceError | null, response: PbRevokeGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve({ id: response.getId() });
          }
        }
      );
    });
  }

  introspectToken(
    id: string,
    tokenValue: string,
    access: AccessItem[]
  ): Promise<IntrospectTokenResult> {
    const request = new PbIntrospectTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setAccessList(access.map(toPbAccessItem));

    return new Promise((resolve, reject) => {
      this._grpcClient.introspectToken(
        request,
        (error: ServiceError | null, response: PbIntrospectTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(fromPbIntrospectTokenResponse(response));
          }
        }
      );
    });
  }

  rotateToken(
    id: string,
    tokenValue: string,
    managementId: string
  ): Promise<RotateTokenResult> {
    const request = new PbRotateTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setManagementId(managementId);

    return new Promise((resolve, reject) => {
      this._grpcClient.rotateToken(
        request,
        (error: ServiceError | null, response: PbRotateTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(fromPbRotateTokenResponse(response));
          }
        }
      );
    });
  }

  revokeToken(
    id: string,
    tokenValue: string,
    managementId: string
  ): Promise<RevokeTokenResult> {
    const request = new PbRevokeTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setManagementId(managementId);

    return new Promise((resolve, reject) => {
      this._grpcClient.revokeToken(
        request,
        (error: ServiceError | null, response: PbRevokeTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve({ id: response.getId() });
          }
        }
      );
    });
  }

  acceptInteraction(
    id: string,
    interactRef: string,
    nonce: string
  ): Promise<HandleInteractionChoiceResult> {
    const request = new PbAcceptInteractionRequest();
    request.setId(id);
    request.setInteractRef(interactRef);
    request.setNonce(nonce);

    return new Promise((resolve, reject) => {
      this._grpcClient.acceptInteraction(
        request,
        (
          error: ServiceError | null,
          response: PbHandleInteractionChoiceResponse
        ) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: response.getSuccess() });
          }
        }
      );
    });
  }

  rejectInteraction(
    id: string,
    nonce: string
  ): Promise<HandleInteractionChoiceResult> {
    const request = new PbRejectInteractionRequest();
    request.setId(id);
    request.setNonce(nonce);

    return new Promise((resolve, reject) => {
      this._grpcClient.rejectInteraction(
        request,
        (
          error: ServiceError | null,
          response: PbHandleInteractionChoiceResponse
        ) => {
          if (error) {
            reject(error);
          } else {
            resolve({ success: response.getSuccess() });
          }
        }
      );
    });
  }
}

function toPbAccessLimits(input: AccessLimits): PbAccessLimits {
  const accessLimits = new PbAccessLimits();
  if (input.receiver) {
    accessLimits.setReceiver(input.receiver);
  }
  if (input.interval) {
    accessLimits.setInterval(input.interval);
  }

  if (input.debitAmount) {
    accessLimits.setDebitAmountValue(input.debitAmount.value);
    accessLimits.setAssetCode(input.debitAmount.assetCode);
    accessLimits.setAssetScale(input.debitAmount.assetScale);
  } else if (input.receiveAmount) {
    accessLimits.setReceiveAmountValue(input.receiveAmount.value);
    accessLimits.setAssetCode(input.receiveAmount.assetCode);
    accessLimits.setAssetScale(input.receiveAmount.assetScale);
  }

  return accessLimits;
}

function fromPbAccessLimits(
  accessLimits?: PbAccessLimits
): AccessLimits | undefined {
  if (!accessLimits) {
    return undefined;
  }

  const limits: AccessLimits = {};
  if (accessLimits.getReceiver()) {
    limits.receiver = accessLimits.getReceiver();
  }
  if (accessLimits.getInterval()) {
    limits.interval = accessLimits.getInterval();
  }

  if (accessLimits.getDebitAmountValue()) {
    limits.debitAmount = {
      value: accessLimits.getDebitAmountValue(),
      assetCode: accessLimits.getAssetCode(),
      assetScale: accessLimits.getAssetScale()
    };
  } else if (accessLimits.getReceiveAmountValue()) {
    limits.receiveAmount = {
      value: accessLimits.getReceiveAmountValue(),
      assetCode: accessLimits.getAssetCode(),
      assetScale: accessLimits.getAssetScale()
    };
  }

  return limits;
}

function toPbAccessItem(input: AccessItem): PbAccessItem {
  const accessItem = new PbAccessItem();
  accessItem.setType(input.type);
  accessItem.setActionsList(input.actions);
  if (input.identifier) {
    accessItem.setIdentifier(input.identifier);
  }
  if (input.limits) {
    accessItem.setLimits(toPbAccessLimits(input.limits));
  }
  return accessItem;
}

function fromPbAccessItem(accessItem: PbAccessItem): AccessItem {
  return {
    type: accessItem.getType(),
    actions: accessItem.getActionsList(),
    identifier: accessItem.getIdentifier() || undefined,
    limits: fromPbAccessLimits(accessItem.getLimits())
  };
}

function toPbSubjectId(input: SubjectId): PbSubjectId {
  const subjectId = new PbSubjectId();
  subjectId.setFormat(input.format);
  subjectId.setId(input.id);
  return subjectId;
}

function fromPbSubjectId(subjectId: PbSubjectId): SubjectId {
  return { id: subjectId.getId(), format: subjectId.getFormat() };
}

function toPbGrantRequestFinish(input: GrantFinish): PbGrantRequestFinish {
  const finish = new PbGrantRequestFinish();
  finish.setFinish(input.method);
  finish.setUri(input.uri);
  finish.setNonce(input.nonce);
  return finish;
}

function fromPbAccessToken(accessToken: PbAccessToken): AccessTokenResult {
  return {
    value: accessToken.getValue(),
    managementId: accessToken.getManagementId(),
    expiresIn: accessToken.getExpiresIn(),
    revokedAt: accessToken.getRevokedAt()
  };
}

function fromPbInteraction(
  interaction?: PbInteraction
): InteractionResult | undefined {
  if (!interaction) {
    return undefined;
  }
  return {
    interactRef: interaction.getInteractRef(),
    clientNonce: interaction.getClientNonce(),
    state: interaction.getState(),
    expiresInMs: interaction.getExpiresInMs()
  };
}

function fromPbGrant(grant: PbGrant): GetGrantResult {
  return {
    id: grant.getId(),
    start: grant.getStartList(),
    continueToken: grant.getContinueToken(),
    continueId: grant.getContinueId(),
    interactionNonce: grant.getInteractionNonce(),
    state: grant.getState(),
    finalization: grant.getFinalization(),
    client: grant.getClient(),
    subIds: grant.getSubIdsList().map(fromPbSubjectId),
    accesses: grant.getAccessesList().map(fromPbAccessItem),
    finishMethod: grant.getFinishMethod(),
    finishUri: grant.getFinishUri(),
    finishNonce: grant.getFinishNonce(),
    interaction: fromPbInteraction(grant.getInteraction()),
    lastContinuedAt: grant.getLastContinuedAt(),
    accessTokens: grant.getAccessTokensList().map(fromPbAccessToken)
  };
}

function fromPbCreateGrantResponse(
  response: PbCreateGrantResponse
): CreateGrantResult {
  return {
    id: response.getId(),
    continueId: response.getContinueId(),
    continueToken: response.getContinueToken(),
    interactionNonce: response.getInteractionNonce(),
    accessTokenValue: response.getAccessTokenValue(),
    accessTokenManagementId: response.getAccessTokenManagementId(),
    accessTokenExpiresIn: response.getAccessTokenExpiresIn(),
    access: response.getAccessList().map(fromPbAccessItem),
    subjectIds: response.getSubIdsList().map(fromPbSubjectId)
  };
}

function fromPbContinueGrantResponse(
  response: PbContinueGrantResponse
): ContinueGrantResult {
  return {
    id: response.getId(),
    finalizationReason: response.getFinalizationReason(),
    accessTokenValue: response.getAccessTokenValue(),
    accessTokenManagementId: response.getAccessTokenManagementId(),
    accessTokenExpiresIn: response.getAccessTokenExpiresIn(),
    access: response.getAccessList().map(fromPbAccessItem),
    continueId: response.getContinueId(),
    continueToken: response.getContinueToken()
  };
}

function fromPbRotateTokenResponse(
  response: PbRotateTokenResponse
): RotateTokenResult {
  return {
    grantId: response.getGrantId(),
    newAccessTokenValue: response.getNewAccessTokenValue(),
    newAccessTokenManagementId: response.getNewAccessTokenManagementId(),
    newAccessTokenExpiresIn: response.getNewAccessTokenExpiresIn(),
    access: response.getAccessList().map(fromPbAccessItem)
  };
}

function fromPbIntrospectTokenResponse(
  response: PbIntrospectTokenResponse
): IntrospectTokenResult {
  return {
    active: response.getActive(),
    grantId: response.getGrantId(),
    access: response.getAccessList().map(fromPbAccessItem)
  };
}

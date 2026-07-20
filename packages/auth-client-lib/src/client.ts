import * as grpc from '@grpc/grpc-js';
import { ServiceError } from '@grpc/grpc-js';
import {
  RafikiAuthClient,
  GrantRequest,
  Grant,
  GetGrantRequest,
  AccessItem,
  GrantRequestFinish,
  SubjectId,
  RevokeGrantResponse,
  ContinueGrantResponse,
  RotateTokenResponse,
  RevokeTokenResponse,
  CreateGrantResponse,
  HandleInteractionChoiceResponse,
  AcceptInteractionRequest,
  RejectInteractionRequest,
  ContinueGrantRequest,
  RevokeGrantRequest,
  IntrospectTokenResponse,
  IntrospectTokenRequest,
  RotateTokenRequest,
  RevokeTokenRequest
} from 'auth-public-types-lib';

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

  getGrant(id: string): Promise<Grant> {
    const request = new GetGrantRequest();
    request.setId(id);

    return new Promise((resolve, reject) => {
      this._grpcClient.getGrant(
        request,
        (error: ServiceError | null, response: Grant) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  createGrant(
    access: AccessItem[],
    client: string,
    subjectIds: SubjectId[],
    finish: GrantRequestFinish
  ): Promise<CreateGrantResponse> {
    const request = new GrantRequest();
    request.setAccessList(access);
    request.setClient(client);
    request.setSubjectIdsList(subjectIds);
    request.setFinish(finish);

    return new Promise((resolve, reject) => {
      this._grpcClient.createGrant(
        request,
        (error: ServiceError | null, response: CreateGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
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
  ): Promise<ContinueGrantResponse> {
    const request = new ContinueGrantRequest();
    request.setId(id);
    request.setContinueId(continueId);
    request.setContinueToken(continueToken);
    request.setInteractRef(interactRef);

    return new Promise((resolve, reject) => {
      this._grpcClient.continueGrant(
        request,
        (error: ServiceError | null, response: ContinueGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  revokeGrant(
    id: string,
    continueId: string,
    continueToken: string
  ): Promise<RevokeGrantResponse> {
    const request = new RevokeGrantRequest();
    request.setId(id);
    request.setContinueId(continueId);
    request.setContinueToken(continueToken);

    return new Promise((resolve, reject) => {
      this._grpcClient.revokeGrant(
        request,
        (error: ServiceError | null, response: RevokeGrantResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  introspectToken(
    id: string,
    tokenValue: string,
    access: AccessItem[]
  ): Promise<IntrospectTokenResponse> {
    const request = new IntrospectTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setAccessList(access);

    return new Promise((resolve, reject) => {
      this._grpcClient.introspectToken(
        request,
        (error: ServiceError | null, response: IntrospectTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  rotateToken(
    id: string,
    tokenValue: string,
    managementId: string
  ): Promise<RotateTokenResponse> {
    const request = new RotateTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setManagementId(managementId);

    return new Promise((resolve, reject) => {
      this._grpcClient.rotateToken(
        request,
        (error: ServiceError | null, response: RotateTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  revokeToken(
    id: string,
    tokenValue: string,
    managementId: string
  ): Promise<RevokeTokenResponse> {
    const request = new RevokeTokenRequest();
    request.setId(id);
    request.setTokenValue(tokenValue);
    request.setManagementId(managementId);

    return new Promise((resolve, reject) => {
      this._grpcClient.revokeToken(
        request,
        (error: ServiceError | null, response: RevokeTokenResponse) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  acceptInteraction(
    id: string,
    interactRef: string,
    nonce: string
  ): Promise<HandleInteractionChoiceResponse> {
    const request = new AcceptInteractionRequest();
    request.setId(id);
    request.setInteractRef(interactRef);
    request.setNonce(nonce);

    return new Promise((resolve, reject) => {
      this._grpcClient.acceptInteraction(
        request,
        (
          error: ServiceError | null,
          response: HandleInteractionChoiceResponse
        ) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  rejectInteraction(
    id: string,
    nonce: string
  ): Promise<HandleInteractionChoiceResponse> {
    const request = new RejectInteractionRequest();
    request.setId(id);
    request.setNonce(nonce);

    return new Promise((resolve, reject) => {
      this._grpcClient.rejectInteraction(
        request,
        (
          error: ServiceError | null,
          response: HandleInteractionChoiceResponse
        ) => {
          if (error) {
            reject(error);
          } else {
            resolve(response);
          }
        }
      );
    });
  }
}

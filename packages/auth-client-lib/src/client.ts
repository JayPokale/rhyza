import * as grpc from '@grpc/grpc-js';
import { ServiceError } from '@grpc/grpc-js';
import {
    RafikiAuthClient,
    GrantRequest,
    Grant,
    GrantContinuationRequest,
    GrantRevocationRequest,
    TokenIntrospectionRequest,
    TokenInfo,
    TokenRotationRequest,
    AccessToken,
    TokenRevocationRequest,
    StartInteractionRequest,
    StartOrFinishInteractionResponse,
    FinishInteractionRequest,
    GetGrantDetailsRequest,
    GrantDetails,
    InteractionChoiceRequest,
    InteractionChoiceResponse,
    AccessItem,
    GrantRequestAccessToken,
    GrantRequestInteract,
    Subject
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

    createGrant(
        tenantId: string,
        client: string,
        accessToken: GrantRequestAccessToken,
        interact: GrantRequestInteract,
        subject: Subject
    ): Promise<Grant> {
        const request = new GrantRequest();
        request.setTenantId(tenantId);
        request.setClient(client);
        request.setAccessToken(accessToken);
        request.setInteract(interact);
        request.setSubject(subject);

        return new Promise((resolve, reject) => {
            this._grpcClient.createGrant(
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

    continueGrant(
        continueId: string,
        continueToken: string,
        interactRef: string
    ): Promise<Grant> {
        const request = new GrantContinuationRequest();
        request.setContinueId(continueId);
        request.setContinueToken(continueToken);
        request.setInteractRef(interactRef);

        return new Promise((resolve, reject) => {
            this._grpcClient.continueGrant(
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

    revokeGrant(
        tenantId: string,
        continueId: string,
        continueToken: string
    ): Promise<Grant> {
        const request = new GrantRevocationRequest();
        request.setTenantId(tenantId);
        request.setContinueId(continueId);
        request.setContinueToken(continueToken);

        return new Promise((resolve, reject) => {
            this._grpcClient.revokeGrant(
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

    introspectToken(
        accessToken: string,
        access: AccessItem[]
    ): Promise<TokenInfo> {
        const request = new TokenIntrospectionRequest();
        request.setAccessToken(accessToken);
        request.setAccessList(access);

        return new Promise((resolve, reject) => {
            this._grpcClient.introspectToken(
                request,
                (error: ServiceError | null, response: TokenInfo) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    rotateToken(accessTokenId: string): Promise<AccessToken> {
        const request = new TokenRotationRequest();
        request.setAccessTokenId(accessTokenId);

        return new Promise((resolve, reject) => {
            this._grpcClient.rotateToken(
                request,
                (error: ServiceError | null, response: AccessToken) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    revokeToken(accessTokenId: string): Promise<AccessToken> {
        const request = new TokenRevocationRequest();
        request.setAccessTokenId(accessTokenId);

        return new Promise((resolve, reject) => {
            this._grpcClient.revokeToken(
                request,
                (error: ServiceError | null, response: AccessToken) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    startInteraction(
        interactId: string,
        nonce: string,
        clientName: string,
        clientUri: string
    ): Promise<StartOrFinishInteractionResponse> {
        const request = new StartInteractionRequest();
        request.setInteractId(interactId);
        request.setNonce(nonce);
        request.setClientName(clientName);
        request.setClientUri(clientUri);

        return new Promise((resolve, reject) => {
            this._grpcClient.startInteraction(
                request,
                (
                    error: ServiceError | null,
                    response: StartOrFinishInteractionResponse
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

    finishInteraction(
        interactId: string,
        nonce: string,
        sessionNonce: string
    ): Promise<StartOrFinishInteractionResponse> {
        const request = new FinishInteractionRequest();
        request.setInteractId(interactId);
        request.setNonce(nonce);
        request.setSessionNonce(sessionNonce);

        return new Promise((resolve, reject) => {
            this._grpcClient.finishInteraction(
                request,
                (
                    error: ServiceError | null,
                    response: StartOrFinishInteractionResponse
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

    getGrantDetails(
        interactId: string,
        nonce: string
    ): Promise<GrantDetails> {
        const request = new GetGrantDetailsRequest();
        request.setInteractId(interactId);
        request.setNonce(nonce);

        return new Promise((resolve, reject) => {
            this._grpcClient.getGrantDetails(
                request,
                (error: ServiceError | null, response: GrantDetails) => {
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
        interactId: string,
        nonce: string
    ): Promise<InteractionChoiceResponse> {
        const request = new InteractionChoiceRequest();
        request.setInteractId(interactId);
        request.setNonce(nonce);

        return new Promise((resolve, reject) => {
            this._grpcClient.acceptInteraction(
                request,
                (error: ServiceError | null, response: InteractionChoiceResponse) => {
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
        interactId: string,
        nonce: string
    ): Promise<InteractionChoiceResponse> {
        const request = new InteractionChoiceRequest();
        request.setInteractId(interactId);
        request.setNonce(nonce);

        return new Promise((resolve, reject) => {
            this._grpcClient.rejectInteraction(
                request,
                (error: ServiceError | null, response: InteractionChoiceResponse) => {
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

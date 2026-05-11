/* eslint-disable @typescript-eslint/no-explicit-any */
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { ReflectionService } from '@grpc/reflection';
import {
  sendUnaryData,
  ServerDuplexStream,
  ServerUnaryCall
} from '@grpc/grpc-js';

import {
  RafikiAuthService,
  HealthService,
  HealthCheckRequest,
  HealthCheckResponse,
  GrantRequest,
  GrantContinuationRequest,
  GrantRevocationRequest,
  TokenIntrospectionRequest,
  TokenRotationRequest,
  TokenRevocationRequest,
  StartInteractionRequest,
  FinishInteractionRequest,
  GetGrantDetailsRequest,
  InteractionChoiceRequest,
  Grant,
  StartOrFinishInteractionResponse,
  TokenInfo,
  AccessToken,
  GrantDetails,
  InteractionChoiceResponse
} from 'auth-public-types-lib';

import { IMessage, IMessageConsumer, IMessageProducer, DomainEvent } from 'common-types-lib';
import {
  CreateGrantCmd,
  ContinueGrantCmd,
  RevokeGrantCmd,
  RotateAccessTokenCmd,
  RevokeAccessTokenCommand,
  InteractionApprovedCommand,
  InteractionDeniedCommand,
  GrantCreatedEvent,
  GrantCreateFailedEvent,
  GrantContinuedEvent,
  GrantContinueFailedEvent,
  GrantInteractionChoiceHandledEvent,
  GrantInteractionChoiceFailedEvent
} from 'auth-domain-lib';
import crypto from 'crypto';

const PUBLIC_TYPES_LIB_PATH = require.resolve('auth-public-types-lib');
const DEFAULT_RESPONSE_TIMEOUT_MS = 120_000;

interface PendingResponse {
  callback: sendUnaryData<any>;
  timer: ReturnType<typeof setTimeout>;
}

export class AuthServiceServer {
  private readonly _instanceId: string;
  private readonly _serverUrl: string;
  private readonly _server: grpc.Server;
  private readonly _msgProducer: IMessageProducer;
  private readonly _msgConsumer: IMessageConsumer;
  private readonly _responseTimeoutMs: number;
  private readonly _responseMap: Map<string, PendingResponse> = new Map();
  private _startedAt: number = 0;
  private _terminating: boolean = false;

  constructor(
    instanceId: string,
    serverUrl: string,
    msgProducer: IMessageProducer,
    msgConsumer: IMessageConsumer,
    responseTimeoutMs: number = DEFAULT_RESPONSE_TIMEOUT_MS
  ) {
    this._responseTimeoutMs = responseTimeoutMs;
    this._serverUrl = serverUrl;
    this._instanceId = instanceId;
    this._msgProducer = msgProducer;
    this._msgConsumer = msgConsumer;

    this._msgConsumer.setBatchCallbackFn(this._handleBatch.bind(this));

    this._server = new grpc.Server({
      'grpc.max_concurrent_streams': 100,
      'grpc.max_connection_age_grace_ms': 60_000,
      'grpc.keepalive_time_ms': 10_000,
      'grpc.keepalive_timeout_ms': 5_000,
      'grpc.keepalive_permit_without_calls': 1
    });

    const protoDirPath = join(
      path.dirname(PUBLIC_TYPES_LIB_PATH),
      '/proto_files/'
    );
    const protoFilePath = join(protoDirPath, 'auth-svc.proto');
    const packageDefinition = protoLoader.loadSync(protoFilePath, {
      includeDirs: [protoDirPath]
    });
    const reflection = new ReflectionService(packageDefinition);
    reflection.addToServer(this._server);

    this._server.addService(HealthService, {
      check: this._handleUnaryHealthCheck.bind(this),
      watch: this._handleHealthWatchStream.bind(this)
    });

    this._server.addService(RafikiAuthService, {
      createGrant: this._handleUnary.bind(this),
      continueGrant: this._handleUnary.bind(this),
      revokeGrant: this._handleUnary.bind(this),
      introspectToken: this._handleUnary.bind(this),
      rotateToken: this._handleUnary.bind(this),
      revokeToken: this._handleUnary.bind(this),
      startInteraction: this._handleUnary.bind(this),
      finishInteraction: this._handleUnary.bind(this),
      getGrantDetails: this._handleUnary.bind(this),
      acceptInteraction: this._handleUnary.bind(this),
      rejectInteraction: this._handleUnary.bind(this)
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const credentials = grpc.ServerCredentials.createInsecure();
      console.info(`Starting Auth GRPC service at: ${this._serverUrl}...`);

      this._server.bindAsync(this._serverUrl, credentials, (error) => {
        if (error !== null) {
          console.error(error);
          reject(error);
          return;
        }

        this._startedAt = Date.now();
        return resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this._terminating = true;
    console.info('Stopping the server...');

    return new Promise((resolve, reject) => {
      this._server.tryShutdown((error) => {
        if (error !== undefined) {
          console.info(`Shutdown completed with error: ${error}`);
          reject(error);
          return;
        }

        console.info('Shutdown completed successfully');
        resolve();
      });
    });
  }

  private async _handleUnaryHealthCheck(
    call: ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
    callback: sendUnaryData<HealthCheckResponse>
  ): Promise<void> {
    callback(
      null,
      new HealthCheckResponse().setStatus(
        HealthCheckResponse.ServingStatus.SERVING
      )
    );
  }

  private async _handleHealthWatchStream(
    call: ServerDuplexStream<HealthCheckRequest, HealthCheckResponse>
  ): Promise<void> {
    call.emit('error', {
      code: grpc.status.UNIMPLEMENTED,
      message: 'Not yet implemented'
    });
  }

  private async _handleUnary(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ): Promise<void> {
    if (call.request instanceof GrantRequest) {
      const commandId = crypto.randomUUID();
      this._storePendingResponse(commandId, call, callback);

      const accessList = call.request.getAccessList().map((item: any) => ({
        type: item.getType().toString(),
        actions: item.getActionsList().map((a: any) => a.toString()),
        identifier: item.getIdentifier(),
        limits: item.getLimits() ? {
          receiver: item.getLimits().getReceiver(),
          assetCode: item.getLimits().getAssetCode(),
          assetScale: item.getLimits().getDebitAmount() ? item.getLimits().getDebitAmount().getScale() : 0,
        } : undefined
      }));

      const subject = call.request.getSubject();
      const subjectIds = subject ? subject.getSubIdsList().map((s: any) => ({ format: s.getFormat(), id: s.getId() })) : [];

      const finishObj = call.request.getFinish();
      const finish = finishObj ? {
        method: finishObj.getFinish().toString(),
        uri: finishObj.getUri(),
        nonce: finishObj.getNonce()
      } : undefined;

      const startMethods = call.request.getStartList().map((s: any) => s.toString());
      if (startMethods.length === 0) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'At least one start method must be provided'
        });
        return;
      }

      const cmd = new CreateGrantCmd(
        {
          id: commandId,
          access: accessList,
          client: call.request.getClient(),
          subjectIds: subjectIds,
          interact: finish ? { start: startMethods, finish } : { start: startMethods }
        },
        commandId
      );
      await this._msgProducer.send(cmd);
    } else if (call.request instanceof GrantContinuationRequest) {
      const commandId = crypto.randomUUID();
      this._storePendingResponse(commandId, call, callback);

      const cmd = new ContinueGrantCmd(
        {
          id: call.request.getContinueId(),
          continueId: call.request.getContinueId(),
          continueToken: call.request.getContinueToken(),
          interactRef: call.request.getInteractRef()
        },
        commandId
      );
      await this._msgProducer.send(cmd);
    } else if (call.request instanceof InteractionChoiceRequest) {
      // acceptInteraction and rejectInteraction
      const commandId = crypto.randomUUID();
      this._storePendingResponse(commandId, call, callback);

      // we need to know the grant id. Use interactId as grant ID for now, similar to continueId.
      const interactId = call.request.getInteractId();

      // Determine if it was called via Accept or Reject based on call.path or something else?
      // Actually, ServerUnaryCall does not easily give the method if we just bind to _handleUnary.
      // So let's separate them in addService or handle it manually.
      // We will fix this in a separate method if needed.
    } else {
      callback(
        new Error(`Invalid request type: ${call.request.constructor.name}`)
      );
    }
  }

  private _storePendingResponse(
    commandId: string,
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ): void {
    const deadline = call.getDeadline();
    let timeoutMs: number;

    if (deadline instanceof Date) {
      timeoutMs = deadline.getTime() - Date.now();
    } else if (typeof deadline === 'number' && deadline !== Infinity) {
      timeoutMs = deadline - Date.now();
    } else {
      timeoutMs = this._responseTimeoutMs;
    }

    timeoutMs = Math.max(timeoutMs, 0);

    const timer = setTimeout(() => {
      const pending = this._responseMap.get(commandId);
      if (pending) {
        this._responseMap.delete(commandId);
        pending.callback({
          code: grpc.status.DEADLINE_EXCEEDED,
          message: 'Response timeout exceeded'
        });
      }
    }, timeoutMs);

    this._responseMap.set(commandId, { callback, timer });
  }

  private async _handleBatch(messages: IMessage[]): Promise<void> {
    for (const message of messages) {
      await this._handleResponseEvent(message);
    }
  }

  private async _handleResponseEvent(message: IMessage): Promise<void> {
    const requestId = message.requestId;
    if (!requestId) return;

    const pending = this._responseMap.get(requestId);
    if (!pending) return;

    const event = message as DomainEvent;

    if (event.msgName === GrantCreatedEvent.name) {
      // Create response object
      const response = new Grant();
      // Need to populate it fully, but empty for now based on what event returns
      this._resolvePendingResponse(pending, requestId, null, response);
    } else if (event.msgName === GrantCreateFailedEvent.name) {
      this._resolvePendingResponse(pending, requestId, {
        code: grpc.status.INTERNAL,
        message: (event.payload as GrantCreateFailedEvent['payload']).message || 'Command processing failed',
        details: (event.payload as GrantCreateFailedEvent['payload']).message,
        name: (event.payload as GrantCreateFailedEvent['payload']).errorName || 'CommandError',
        metadata: new grpc.Metadata()
      });
    } else if (event.msgName === GrantContinuedEvent.name) {
      const response = new Grant();
      this._resolvePendingResponse(pending, requestId, null, response);
    } else if (event.msgName === GrantContinueFailedEvent.name) {
      this._resolvePendingResponse(pending, requestId, {
        code: grpc.status.INTERNAL,
        message: (event.payload as GrantContinueFailedEvent['payload']).message || 'Command processing failed',
        details: (event.payload as GrantContinueFailedEvent['payload']).message,
        name: (event.payload as GrantContinueFailedEvent['payload']).errorName || 'CommandError',
        metadata: new grpc.Metadata()
      });
    } else {
      console.warn(
        `Unknown response event — msgName: ${message.msgName}, requestId: ${requestId}`
      );
    }
  }

  private _resolvePendingResponse(
    pending: PendingResponse,
    commandId: string,
    error: grpc.ServiceError | null,
    response?: any
  ): void {
    clearTimeout(pending.timer);
    this._responseMap.delete(commandId);
    pending.callback(error, response);
  }
}

'use strict';

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
  CreateIncomingPaymentRequest,
  CreateIncomingPaymentResponse,
  GetIncomingPaymentRequest,
  GetIncomingPaymentResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  HealthService,
  PaymentsGrpcService
} from 'payments-public-types-lib';

const PUBLIC_TYPES_LIB_PATH = require.resolve('payments-public-types-lib');

const DEFAULT_RESPONSE_TIMEOUT_MS = 120_000; // 2 minutes;

interface PendingResponse {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: sendUnaryData<any>;
  timer: ReturnType<typeof setTimeout>;
}

export class PaymentsServiceServer {
  private readonly _instanceId: string;
  private readonly _serverUrl: string;
  private readonly _server: grpc.Server;
  private readonly _responseTimeoutMs: number;
  // Holds pending gRPC callbacks keyed by command ID (UUID).
  // Kafka consumer resolves/rejects these when response events arrive.
  // Entries are cleaned up on response or when the deadline expires.
  private readonly _responseMap: Map<string, PendingResponse> = new Map();
  private _startedAt: number = 0;
  private _terminating: boolean = false;

  constructor(
    instanceId: string,
    serverUrl: string,
    responseTimeoutMs: number = DEFAULT_RESPONSE_TIMEOUT_MS
  ) {
    this._responseTimeoutMs = responseTimeoutMs;
    this._serverUrl = serverUrl;
    this._instanceId = instanceId;

    this._server = new grpc.Server({
      'grpc.max_concurrent_streams': 100,
      'grpc.max_connection_age_grace_ms': 60_000,
      'grpc.keepalive_time_ms': 10_000,
      'grpc.keepalive_timeout_ms': 5_000,
      'grpc.keepalive_permit_without_calls': 1
    });

    // reflection
    const protoDirPath = join(
      path.dirname(PUBLIC_TYPES_LIB_PATH),
      '/proto_files/'
    );
    const protoFilePath = join(protoDirPath, 'payments-svc.proto');
    const packageDefinition = protoLoader.loadSync(protoFilePath, {
      includeDirs: [protoDirPath]
    });
    const reflection = new ReflectionService(packageDefinition);
    reflection.addToServer(this._server);

    // health check service
    this._server.addService(HealthService, {
      check: this._handleUnaryHealthCheck.bind(this),
      watch: this._handleHealthWatchStream.bind(this)
    });

    // payments service RPCs
    this._server.addService(PaymentsGrpcService, {
      createIncomingPayment: this._handleUnary.bind(this),
      getIncomingPayment: this._handleUnary.bind(this)
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const credentials = grpc.ServerCredentials.createInsecure();
      console.info(`Starting Payments GRPC service at: ${this._serverUrl}...`);

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

  // health check handlers
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

  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _handleUnary(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ): Promise<void> {
    if (call.request instanceof CreateIncomingPaymentRequest) {
      const commandId = call.request.getId();
      if (!PaymentsServiceServer.UUID_REGEX.test(commandId)) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'id must be a valid UUID'
        });
        return;
      }
      this._storePendingResponse(commandId, call, callback);
      // TODO: publish command to Kafka
    } else if (call.request instanceof GetIncomingPaymentRequest) {
      const commandId = call.request.getId();
      if (!PaymentsServiceServer.UUID_REGEX.test(commandId)) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          message: 'id must be a valid UUID'
        });
        return;
      }
      this._storePendingResponse(commandId, call, callback);
      // TODO: publish command to Kafka
    } else {
      callback(
        new Error(`Invalid request type: ${call.request.constructor.name}`)
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _storePendingResponse(
    commandId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: ServerUnaryCall<any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Ensure at least a minimal timeout
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

  /**
   * Resolve a pending response by command ID. Called by the Kafka response
   * event handler. Returns false if no pending response was found (e.g.
   * already timed out or belongs to a different API instance).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolvePendingResponse(
    commandId: string,
    error: grpc.ServiceError | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response?: any
  ): boolean {
    const pending = this._responseMap.get(commandId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this._responseMap.delete(commandId);
    pending.callback(error, response);
    return true;
  }
}

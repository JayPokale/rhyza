/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { ReflectionService } from '@grpc/reflection';
import {
  Metadata,
  sendUnaryData,
  ServerDuplexStream,
  ServerUnaryCall
} from '@grpc/grpc-js';

import {
  WalletAddressAggregate,
  AssetAggregate, CreateLedgerCmd, CreateLedgerAccountCmd, LedgerAccountDtoSerializer
} from 'pal-domain-lib';
import {
  PbCreateAssetRequest,
  PbCreateAssetResponse,
  PbCreateWalletAddressRequest,
  PbCreateWalletAddressResponse,
  PbGetAssetRequest,
  PbGetAssetResponse,
  PbGetNonEmptyAssetResponse,
  PbGetWalletAddressesRequest,
  PbGetWalletAddressesResponse,
  HealthCheckRequest,
  HealthCheckResponse,
  HealthService,
  PalGrpcService,
  PbResolveWalletAddressAliasResponse,
  PbResolveWalletAddressNonEmptyResponse,
  PbSingleWalletAddressResponse,
  PbCreateLedgerRequest, LedgerCreatedEvent, LedgerDomainEvent,
  PbCreateLedgerAccountRequest, LedgerNotFoundEvent, PbGetLedgerAccountsRequest, PbGetLedgerAccountsResponse,
  PbGetLedgerTransactionsRequest, PbGetLedgerTransactionsResponse,
} from 'pal-public-types-lib';
import { PbResolveWalletAddressAliasRequest } from 'pal-public-types-lib';
import { PbCreateWalletAddressAliasRequest } from 'pal-public-types-lib';
import { Empty } from 'google-protobuf/google/protobuf/empty_pb';
import {
  DomainEvent,
  DomainEventTopics,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  MessageTypes
} from "common-types-lib";
import {ServerStatusResponse} from "@grpc/grpc-js/src/server-call";
import {Status} from "@grpc/grpc-js/src/constants";
import {ILedgerReadSideRepository} from "pal-implementations-lib";

const PUBLIC_TYPES_LIB_PATH = require.resolve('pal-public-types-lib');

const DEFAULT_RESPONSE_TIMEOUT_MS = 120_000; // 2 minutes;

interface PendingResponse {
  callback: sendUnaryData<any>;
  timer: ReturnType<typeof setTimeout>;
}

export class PalGrpcServer {
  private readonly _instanceId: string;
  private readonly _logger: ILogger;
  private readonly _serverUrl: string;
  private readonly _server: grpc.Server;
  private readonly _assetAggregate: AssetAggregate;
  private readonly _walletAggregate: WalletAddressAggregate;
  private readonly _msgProducer: IMessageProducer;
  private readonly _msgConsumer: IMessageConsumer;
  private readonly _ledgerReadSideRepo: ILedgerReadSideRepository;
  private readonly _responseTimeoutMs: number;
  // Holds pending gRPC callbacks keyed by command ID (UUID).
  // Kafka consumer resolves/rejects these when response events arrive.
  // Entries are cleaned up on response or when the deadline expires.
  private readonly _responseMap: Map<string, PendingResponse>;
  private _startedAt:number;
  private _terminating: boolean;

  constructor(
    instanceId: string,
    serverUrl: string,
    assetAggregate: AssetAggregate,
    walletAggregate: WalletAddressAggregate,
    producer: IMessageProducer,
    consumer: IMessageConsumer,
    ledgerReadSideRepo: ILedgerReadSideRepository,
    logger:ILogger
  ) {
    this._serverUrl = serverUrl;
    this._instanceId = instanceId;
    this._assetAggregate = assetAggregate;
    this._walletAggregate = walletAggregate;
    this._msgProducer = producer;
    this._msgConsumer = consumer;
    this._ledgerReadSideRepo = ledgerReadSideRepo;
    this._logger = logger;

    this._responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS;
    this._responseMap = new Map();
    this._startedAt = 0;
    this._terminating = false;

    this._msgConsumer.setTopics([DomainEventTopics.LedgerEvents]);
    this._msgConsumer.setBatchCallbackFn(this._handleResponseEvents.bind(this));

    this._server = new grpc.Server({
      'grpc.max_concurrent_streams': 100,
      // Allow 60 seconds for pending RPCs to complete before forcibly closing connections
      'grpc.max_connection_age_grace_ms': 60_000,
      // Ping the client every 10 seconds to ensure the connection is still active
      'grpc.keepalive_time_ms': 10_000,
      // Wait 5 second for the ping ack before assuming the connection is dead
      'grpc.keepalive_timeout_ms': 5_000,
      // send pings even without active streams
      'grpc.keepalive_permit_without_calls': 1
    });

    // reflection implementation
    const protoDirPath = join(
      path.dirname(PUBLIC_TYPES_LIB_PATH),
      '/proto_files/'
    );
    const protoFilePath = join(protoDirPath, 'pal-svc.proto');
    const packageDefinition = protoLoader.loadSync(protoFilePath, {
      includeDirs: [protoDirPath]
    });
    const reflection = new ReflectionService(packageDefinition);
    reflection.addToServer(this._server);

    // add the health check service
    this._server.addService(HealthService, {
      check: this._handleUnaryHealthCheck.bind(this),
      watch: this._handleHealthWatchStream.bind(this)
    });

    // all unary calls are handled by the same handler, which distributes requests
    this._server.addService(PalGrpcService, {
      createAsset: this._handleUnary.bind(this),
      getAsset: this._handleUnary.bind(this),
      createWalletAddress: this._handleUnary.bind(this),
      getWalletAddresses: this._handleUnary.bind(this),
      resolveWalletAddressAlias: this._handleUnary.bind(this),
      createWalletAddressAlias: this._handleUnary.bind(this),
      createLedger: this._handleUnary.bind(this),
      createLedgerAccount: this._handleUnary.bind(this),
      getLedgerAccounts: this._handleUnary.bind(this),
      getLedgerTransactions: this._handleUnary.bind(this),
    });
  }

  async start(): Promise<void> {
    await this._msgProducer.connect();

    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();

    return new Promise((resolve, reject) => {
      const credentials = grpc.ServerCredentials.createInsecure();
      this._logger.info(`Starting GRPC service in url: ${this._serverUrl}...`);

      // start the gRPC server
      this._server.bindAsync(this._serverUrl, credentials, (error) => {
        if (error !== null) {
          this._logger.error(error);
          reject(error);
          return;
        }

        this._startedAt = Date.now();
        this._logger.info('GRPC server started successfully');
        return resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this._terminating = true;
    this._logger.info('Stopping the server...');

    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(false);


    return new Promise((resolve, reject) => {
      this._server.tryShutdown((error) => {
        if (error !== undefined) {
          this._logger.info(`Shutdown completed with error: ${error}`);
          reject(error);
          return;
        }

        this._msgProducer.disconnect().then(()=>{
          this._logger.info('Shutdown completed successfully');
          resolve();
        });
      });
    });
  }

  private _storePendingResponse(
    requestId: string,
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

    // Ensure at least a minimal timeout
    timeoutMs = Math.max(timeoutMs, 0);

    const timer = setTimeout(() => {
      const pending = this._responseMap.get(requestId);
      if (pending) {
        this._responseMap.delete(requestId);
        pending.callback({
          code: grpc.status.DEADLINE_EXCEEDED,
          message: 'Response timeout exceeded'
        });
        this._logger.warn(`Response timeout exceeded for requestId: ${requestId} after ${timeoutMs}ms.`);
      }
    }, timeoutMs);

    this._responseMap.set(requestId, { callback, timer });
  }

  private _resolvePendingResponse(
    pending: PendingResponse,
    requestId: string,
    error: {code:Status, message:string} | null,
    response?: any
  ): void {
    clearTimeout(pending.timer);
    this._responseMap.delete(requestId);

    if(error){
      pending.callback({
        code: error.code,
        message: error.message
      });
    }else{
      pending.callback(null, response);
    }
  }

  private async _handleResponseEvents(messages: IMessage[]): Promise<void> {
    for(const msg of messages){
      await this._handleResponseEvent(msg);
    }
  }

  private async _handleResponseEvent(message: IMessage): Promise<void> {
    if(message.msgType !== MessageTypes.DOMAIN_EVENT) {
      return;
    }
    const domainEvent = message as DomainEvent;

    const requestId = domainEvent.requestId;
    if (!requestId) {
      return;
    }

    // Not ours — a different API instance holds the pending callback
    const pending = this._responseMap.get(requestId);
    if (!pending) {
      return
    }

     /*
     NOTE: for now we only handle ledger domain events
     (LedgerCreatedEvent and LedgerAccountCreatedEvent),
     if more are needed, this function should be refactored to split
     by topic, and per topic handler functions should be added
     */

    if(LedgerDomainEvent.isLedgerCreatedEvent(domainEvent)
      || LedgerDomainEvent.isLedgerCreationFailedEvent(domainEvent)){
      await this._handleCreateLedgerResponseEvent(requestId, pending, domainEvent);
    }else if(LedgerDomainEvent.isLedgerAccountCreatedEvent(domainEvent)
      || LedgerDomainEvent.isLedgerAccountCreationFailedEvent(domainEvent)){
      await this._handleCreateLedgerAccountResponseEvent(requestId, pending, domainEvent);
    }else if(LedgerDomainEvent.isLedgerNotFoundEvent(domainEvent)) {
      this._resolvePendingResponse(pending, requestId, {
        code: grpc.status.NOT_FOUND,
        message: `Ledger not found`
      });
    }else{
      this._logger.warn(
        `Unknown response event — msgName: ${message.msgName}, requestId: ${requestId}`
      );
      this._resolvePendingResponse(pending, requestId, {
        code: grpc.status.UNIMPLEMENTED,
        message: 'Method not implemented'
      });
    }

  }

  // region health check handlers
  private async _handleUnaryHealthCheck(
    call: ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
    callback: sendUnaryData<HealthCheckResponse>
  ): Promise<void> {
    // TODO must check other services' availability
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
  // endregion health check handlers

  private async _handleUnary(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call: ServerUnaryCall<any, any>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: sendUnaryData<any>
  ): Promise<void> {
    let requestIsAsync = false;
    let specificRequestHandler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      call: ServerUnaryCall<any, any>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: sendUnaryData<any>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) => Promise<any>;

    if (call.request instanceof PbCreateAssetRequest) {
      specificRequestHandler = this._handleAssetCreateRequest.bind(this);
    } else if (call.request instanceof PbGetAssetRequest) {
      specificRequestHandler = this._handleGetAssetRequest.bind(this);
    } else if (call.request instanceof PbCreateWalletAddressRequest) {
      specificRequestHandler =
        this._handleCreateWalletAddressRequest.bind(this);
    } else if (call.request instanceof PbGetWalletAddressesRequest) {
      specificRequestHandler = this._handleGetWalletAddressesRequest.bind(this);
    } else if (call.request instanceof PbResolveWalletAddressAliasRequest) {
      specificRequestHandler =
        this._handleResolveWalletAddressAliasRequest.bind(this);
    } else if (call.request instanceof PbCreateWalletAddressAliasRequest) {
      specificRequestHandler =
        this._handleCreateWalletAddressAliasRequest.bind(this);
    } else if (call.request instanceof PbCreateLedgerRequest) {
      specificRequestHandler =
        this._handleCreateLedgerRequest.bind(this);
      requestIsAsync = true;
    } else if (call.request instanceof PbCreateLedgerAccountRequest) {
      specificRequestHandler =
        this._handleCreateLedgerAccountRequest.bind(this);
      requestIsAsync = true;
    } else if (call.request instanceof PbGetLedgerAccountsRequest) {
      specificRequestHandler =
        this._handleGetLedgerAccountsRequest.bind(this);
    } else if (call.request instanceof PbGetLedgerTransactionsRequest) {
      specificRequestHandler =
        this._handleGetLedgerTransactionsRequest.bind(this);
    } else {
      callback(
        new Error(`Invalid request type: ${call.request.constructor.name}`)
      );
      return;
    }

    try {
      const resp = await specificRequestHandler(call, callback);
      if(!requestIsAsync) {
        callback(null, resp);
      }
    } catch (err) {
      let returnError: Error;
      if (err instanceof Error) {
        returnError = new Error(err.message);
      } else {
        returnError = new Error('unknown error');
      }

      callback(returnError);
    }
  }

  /*
   * Asset related functions
   * */

  private async _handleAssetCreateRequest(
    call: ServerUnaryCall<PbCreateAssetRequest, PbCreateAssetResponse>
  ): Promise<PbCreateAssetResponse> {
    const lowThreshold = call.request.getLiquidityLowThreshold();
    const highThreshold = call.request.getLiquidityHighThreshold();

    await this._assetAggregate.createAsset(
      call.request.getCode(),
      call.request.getScale(),
      lowThreshold ? BigInt(lowThreshold) : undefined,
      highThreshold ? BigInt(highThreshold) : undefined
    );

    const resp = new PbCreateAssetResponse();
    resp.setCode(call.request.getCode());
    resp.setScale(call.request.getScale());

    if (lowThreshold !== null)
      resp.setLiquidityLowThreshold(Number(lowThreshold));
    if (highThreshold !== null)
      resp.setLiquidityHighThreshold(Number(highThreshold));
    return resp;
  }

  private async _handleGetAssetRequest(
    call: ServerUnaryCall<PbGetAssetRequest, PbGetAssetResponse>
  ): Promise<PbGetAssetResponse> {
    const asset = await this._assetAggregate.getAsset(call.request.getCode());
    const resp = new PbGetAssetResponse();

    if (asset) {
      const assetResp = new PbGetNonEmptyAssetResponse();
      assetResp.setCode(asset.code);
      assetResp.setScale(asset.scale);
      if (asset.liquidityLowThreshold !== null) {
        assetResp.setLiquidityLowThreshold(Number(asset.liquidityLowThreshold));
      }
      if (asset.liquidityHighThreshold !== null) {
        assetResp.setLiquidityHighThreshold(
          Number(asset.liquidityHighThreshold)
        );
      }
      resp.setAsset(assetResp);
    }

    return resp;
  }

  /*
   * Wallet Address related functions
   * */

  private async _handleCreateWalletAddressRequest(
    call: ServerUnaryCall<
      PbCreateWalletAddressRequest,
      PbCreateWalletAddressResponse
    >
  ): Promise<PbCreateWalletAddressResponse> {
    const asset = await this._assetAggregate.getAsset(
      call.request.getAssetCode()
    );

    if (!asset) {
      throw new Error(`Asset ${call.request.getAssetCode()} does not exist`);
    }

    const isActive =
      !call.request.hasIsActive() || call.request.getIsActive() == true;

    const domain = call.request.hasDomain()
      ? call.request.getDomain() || null
      : null;

    // Use the wallet domain service to coordinate wallet address and wallet alias
    // aggregates, ie, will automatically create the alias for the address
    await this._walletAggregate.createWalletAddress(
      domain,
      call.request.getPathName(),
      call.request.getPublicName(),
      asset.code,
      asset.scale,
      isActive
    );

    const response = new PbCreateWalletAddressResponse()
      .setPathName(call.request.getPathName())
      .setPublicName(call.request.getPublicName())
      .setAssetCode(asset.code)
      .setAssetScale(asset.scale)
      .setIsActive(isActive);

    if (domain) {
      response.setDomain(domain);
    }
    return response;
  }

  private async _handleGetWalletAddressesRequest(
    call: ServerUnaryCall<PbGetWalletAddressesRequest, PbGetWalletAddressesResponse>
  ): Promise<PbGetWalletAddressesResponse> {
    const wallets = await this._walletAggregate.getWalletAddresses(
      call.request.getIdsList()
    );
    const resp = new PbGetWalletAddressesResponse();

    const walletList = wallets.map((item) => {
      const wallet = new PbSingleWalletAddressResponse();
      wallet.setId(item.id);
      wallet.setPublicName(item.publicName);
      wallet.setAssetCode(item.assetCode);
      wallet.setAssetScale(item.assetScale);
      wallet.setIsActive(item.isActive);
      return wallet;
    });

    resp.setWalletAddressesList(walletList);

    return resp;
  }

  /*
   * Wallet Address Aliases related functions
   * */

  private async _handleResolveWalletAddressAliasRequest(
    call: ServerUnaryCall<
      PbResolveWalletAddressAliasRequest,
      PbResolveWalletAddressAliasResponse
    >
  ): Promise<PbResolveWalletAddressAliasResponse> {
    const domain = call.request.hasDomain()
      ? call.request.getDomain() || null
      : null;
    const pathName = call.request.getPathName();

    const walletAddressId =
      await this._walletAggregate.resolveWalletAddressAlias(
        domain,
        pathName
      );

    const resp = new PbResolveWalletAddressAliasResponse();

    if (walletAddressId == null) {
      return resp;
    }

    const aliasResp = new PbResolveWalletAddressNonEmptyResponse();
    if (domain) aliasResp.setDomain(domain);
    aliasResp.setPathName(pathName);
    aliasResp.setWalletAddressId(walletAddressId);

    resp.setAlias(aliasResp);
    return resp;
  }

  private async _handleCreateWalletAddressAliasRequest(
    call: ServerUnaryCall<PbCreateWalletAddressAliasRequest, Empty>
  ): Promise<Empty> {
    const domain = call.request.hasDomain()
      ? call.request.getDomain() || null
      : null;

    // Use the wallet domain service to coordinate wallet address and wallet alias aggregates
    await this._walletAggregate.createWalletAddressAlias(
      domain,
      call.request.getPathName(),
      call.request.getWalletAddressId()
    );

    return new Empty();
  }

  /*
   * Ledger related functions (only low-level API not SAGA based)
   * */

  private async _handleCreateLedgerRequest(
    call: ServerUnaryCall<PbCreateLedgerRequest, Empty>,
    callback: sendUnaryData<any|undefined>
  ): Promise<void>{
    const cmd = new CreateLedgerCmd({
      id: call.request.getLedgerAssetCode()
    });
    cmd.requestId = crypto.randomUUID();

    await this._msgProducer.send(cmd);

    this._storePendingResponse(cmd.requestId, call, callback);
  }

  private async _handleCreateLedgerResponseEvent(reqId:string, pendingResp:PendingResponse, event:LedgerDomainEvent):Promise<void>{
    let error:any = null;
    let response:any = null;

    if(LedgerDomainEvent.isLedgerCreatedEvent(event)){
      // success response
      response = new Empty();
    }else if(LedgerDomainEvent.isLedgerCreationFailedEvent(event)){
      // error response, check what to put in the error message
      let code:grpc.status;
      if(event.payload.reason === "DUPLICATE_ASSET_CODE"){
        code = grpc.status.ALREADY_EXISTS;
      }else{
        code = grpc.status.UNKNOWN
      }

      error = {
        code: code,
        message: event.payload.reason
      };
    }

    // respond to the client
    this._resolvePendingResponse(pendingResp, reqId, error, response);
  }

  private async _handleCreateLedgerAccountRequest(
    call: ServerUnaryCall<PbCreateLedgerAccountRequest, Empty>,
    callback: sendUnaryData<any|undefined>
  ): Promise<void>{
    const cmd = new CreateLedgerAccountCmd(
      call.request.getAssetCode(),
      {
        id: call.request.getId(),
        name: call.request.getName(),
        assetCode: call.request.getAssetCode(),
        assetDisplayScale: call.request.getAssetDisplayScale(),
      }
    );
    cmd.requestId = crypto.randomUUID();

    await this._msgProducer.send(cmd);

    this._storePendingResponse(cmd.requestId, call, callback);
  }

  private async _handleCreateLedgerAccountResponseEvent(reqId:string, pendingResp:PendingResponse, event:LedgerDomainEvent):Promise<void>{
    let error:any = null;
    let response:any = null;

    if(LedgerDomainEvent.isLedgerAccountCreatedEvent(event)){
      // success response
      response = new Empty();
    }else if(LedgerDomainEvent.isLedgerAccountCreationFailedEvent(event)){
      // error response, check what to put in the error message
      let code:grpc.status;
      if(event.payload.reason === "DUPLICATE_ACCOUNT_ID"){
        code = grpc.status.ALREADY_EXISTS
      }else if(event.payload.reason === "ASSET_CODE_MISMATCH"){
        code = grpc.status.INVALID_ARGUMENT
      }else{
        code = grpc.status.UNKNOWN;
      }

      error = {
        code: code,
        message: event.payload.reason
      };
    }

    // respond to the client
    this._resolvePendingResponse(pendingResp, reqId, error, response);
  }

  private async _handleGetLedgerAccountsRequest(
    call: ServerUnaryCall<PbGetLedgerAccountsRequest, PbGetLedgerAccountsResponse>
  ): Promise<PbGetLedgerAccountsResponse>{
    const accountIds = call.request.getAccountIdsList();
    const accounts = await this._ledgerReadSideRepo.fetchLedgerAccounts(accountIds);

    const resp = new PbGetLedgerAccountsResponse();

    const accountDtos = accounts.map(LedgerAccountDtoSerializer.toDTO);

    return resp.setAccountsList(accountDtos.map(accountDto =>
       new PbGetLedgerAccountsResponse.PbLedgerAccountRead()
        .setId(accountDto.id)
        .setAssetCode(accountDto.assetCode)
        .setName(accountDto.name)
        .setDebitedAmount(accountDto.debitedAmount)
        .setCreditedAmount(accountDto.creditedAmount)
        .setAssetDisplayScale(accountDto.assetDisplayScale)
    ));
  }

  private async _handleGetLedgerTransactionsRequest(
    call: ServerUnaryCall<PbGetLedgerTransactionsRequest, PbGetLedgerTransactionsResponse>
  ): Promise<PbGetLedgerTransactionsResponse>{
   throw new Error("Not implemented");
  }
}


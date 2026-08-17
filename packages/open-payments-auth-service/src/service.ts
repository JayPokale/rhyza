'use strict';

import Fastify, { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { AuthClient } from 'auth-client-lib';
import { grantRoutes } from './routes/grant';
import { tokenRoutes } from './routes/token';

import authServerOpenApiJsonSchema from '../../../open-payments-specifications/json/auth-server.json';
import { errorHandler } from './errors';

import { FastifyOpenApiValidator } from './validator';
import crypto from 'crypto';
import { ILogger } from '../../common-types-lib/dist/logger';
import { PinoLogger } from 'implementations-lib';

const BC_NAME = 'OPEN_PAYMENTS';
const APP_NAME = `${BC_NAME}_AUTH_SVC`;
const INSTANCE_ID = `${APP_NAME}_${crypto.randomUUID()}`;

const PORT = parseInt(process.env['PORT'] || '3003', 10);
const HOST = process.env['HOST'] || '0.0.0.0';
const AUTH_GRPC_URL = process.env['AUTH_GRPC_URL'] || 'localhost:50054';
const OPEN_PAYMENTS_AUTH_SERVER_URL =
  process.env['OPEN_PAYMENTS_AUTH_SERVER_URL'] || 'http://localhost:3003';

declare module 'fastify' {
  interface FastifyRequest {
    gnapToken: string | null;
  }
}
export class OpenPaymentsAuthServer {
  private static logger: ILogger;
  private static server: FastifyInstance;
  private static authClient: AuthClient;

  static async start(): Promise<void> {
    this.logger = new PinoLogger({
      bcName: BC_NAME,
      appName: APP_NAME,
      instanceId: INSTANCE_ID
    });

    this.authClient = new AuthClient(AUTH_GRPC_URL);
    await this.authClient.init();
    console.log(`Connected to Auth service at ${AUTH_GRPC_URL}`);

    this.server = Fastify({
      // If logger is not a PinoLogger, enable Fastify's default logging
      logger: PinoLogger.isPinoLogger(this.logger) ? undefined : true,
      loggerInstance: PinoLogger.isPinoLogger(this.logger)
        ? (this.logger.internalLogger as FastifyBaseLogger)
        : undefined,
      trustProxy: process.env.TRUST_PROXY ?? true
    });

    const validator = new FastifyOpenApiValidator(authServerOpenApiJsonSchema);

    this.server.setValidatorCompiler(({ schema }) => validator.compile(schema));

    this.server.setErrorHandler(errorHandler);

    this.server.register(grantRoutes, {
      authClient: this.authClient,
      openPaymentsAuthServerUrl: OPEN_PAYMENTS_AUTH_SERVER_URL
    });
    this.server.register(tokenRoutes, {
      authClient: this.authClient,
      openPaymentsAuthServerUrl: OPEN_PAYMENTS_AUTH_SERVER_URL
    });

    await this.server.listen({ port: PORT, host: HOST });
    console.log(`Open Payments Auth Server API listening on ${HOST}:${PORT}`);
  }

  static async stop(): Promise<void> {
    await this.server?.close();
    await this.authClient?.disconnect();
  }
}

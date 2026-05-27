'use strict';

import Fastify, { FastifyInstance } from 'fastify';
import { PalClient } from 'pal-client-lib';
import { PaymentsClient } from 'payments-client-lib';
import { walletAddressRoutes } from './routes/wallet-addresses.js';
import { incomingPaymentRoutes } from './routes/incoming-payments.js';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';

import resourceServerOpenApiJsonSchema from '../../../open-payments-specifications/json/resource-server.json';
import {
  OpenPaymentsResourceServerErrorResponse,
  OpenPaymentsResourceServerRouteError
} from './errors.js';

const PORT = parseInt(process.env['PORT'] || '3002', 10);
const HOST = process.env['HOST'] || '0.0.0.0';
const PAL_GRPC_URL = process.env['PAL_GRPC_URL'] || 'localhost:50051';
const PAYMENTS_GRPC_URL = process.env['PAYMENTS_GRPC_URL'] || 'localhost:50052';
const OPEN_PAYMENTS_RESOURCE_SERVER_URL =
  process.env['OPEN_PAYMENTS_RESOURCE_SERVER_URL'] || 'localhost:3002';

export class OpenPaymentsResourceServer {
  private static server: FastifyInstance;
  private static palClient: PalClient;
  private static paymentsClient: PaymentsClient;

  static async start(): Promise<void> {
    this.palClient = new PalClient(PAL_GRPC_URL);
    await this.palClient.init();
    console.log(`Connected to PAL service at ${PAL_GRPC_URL}`);

    this.paymentsClient = new PaymentsClient(PAYMENTS_GRPC_URL);
    await this.paymentsClient.init();
    console.log(`Connected to Payments service at ${PAYMENTS_GRPC_URL}`);

    this.server = Fastify({ logger: true });

    const ajv = new Ajv({
      allErrors: false,
      strict: false
    });

    addFormats(ajv);

    ajv.addFormat('uint64', {
      type: 'string',
      validate: (data: string) => /^\d+$/.test(data)
    });

    for (const [name, schemaContent] of Object.entries(
      resourceServerOpenApiJsonSchema.components.schemas
    )) {
      const schema = {
        ...schemaContent,
        $id: `#/components/schemas/${name}`
      };
      ajv.addSchema(schema);
    }

    this.server.setValidatorCompiler(({ schema }) => ajv.compile(schema));

    this.server.setErrorHandler((error, _, reply) => {
      let resourceServerError: OpenPaymentsResourceServerErrorResponse;
      let statusCode: number;

      if (error.validation) {
        statusCode = 400;
        resourceServerError = {
          error: {
            code: 'invalid_request',
            description: error.message
          }
        };
      } else if (error instanceof OpenPaymentsResourceServerRouteError) {
        statusCode = error.status;
        resourceServerError = {
          error: {
            code: error.code,
            description: error.message
          }
        };
      } else {
        console.error(error);

        statusCode = 500;
        resourceServerError = {
          error: {
            code: 'invalid_request',
            description: 'Unhandled error'
          }
        };
      }

      reply.status(statusCode).send(resourceServerError);
    });

    this.server.register(incomingPaymentRoutes, {
      palClient: this.palClient,
      paymentsClient: this.paymentsClient
    });

    this.server.register(walletAddressRoutes, {
      palClient: this.palClient,
      openPaymentsResourceServerUrl: OPEN_PAYMENTS_RESOURCE_SERVER_URL
    });

    await this.server.listen({ port: PORT, host: HOST });
    console.log(
      `Open Payments Resource Server API listening on ${HOST}:${PORT}`
    );
  }

  static async stop(): Promise<void> {
    await this.server?.close();
    await this.palClient?.disconnect();
    await this.paymentsClient?.disconnect();
  }
}

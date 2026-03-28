import { OpenTelemetryService, logger } from 'implementations-lib';

OpenTelemetryService.Start(
  'payments',
  'payments-api-service',
  '1',
  'payments-api-service',
  logger
);

import { OpenTelemetryService, logger } from 'implementations-lib';

OpenTelemetryService.Start(
  'payments',
  'payments-command-handler-service',
  '1',
  'payments-command-handler-service',
  logger
);

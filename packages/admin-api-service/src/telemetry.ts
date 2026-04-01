import { OpenTelemetryService, logger } from 'implementations-lib';

OpenTelemetryService.Start(
  'admin-api-service',
  'admin-api-service',
  '1',
  'admin-api-service',
  logger
);

import { OpenTelemetryService, logger } from 'implementations-lib';

OpenTelemetryService.Start(
  'pal',
  'pal-api-service',
  '1',
  'pal-api-service',
  logger
);

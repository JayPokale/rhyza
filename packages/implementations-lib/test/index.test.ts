import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ConsoleLogger, ILogger } from 'common-types-lib';
import { PinoLogger } from '../src/logger';
import { OpenTelemetryService } from '../src/telemetry/open-telemetry-service';
import crypto from 'crypto';
import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';

const BC_NAME = 'TEST';
const APP_NAME = `${BC_NAME}_SCRIPT`;
const INSTANCE_ID = `${APP_NAME}_${crypto.randomUUID()}`;

let logger: ILogger;

test('Logger - create PinoLogger', async () => {
  logger = new PinoLogger({
    bcName: BC_NAME,
    appName: APP_NAME,
    instanceId: INSTANCE_ID
  });

  assert.ok(logger);
  logger.trace('test trace');
  logger.debug('test debug');
  logger.info('test info');
  logger.warn('test warn');
  logger.error(new Error('error message'), 'test error');
});

test('Logger - PinoLogger outputs', async () => {
  assert.ok(logger);
  logger.trace('test trace');
  logger.debug('test debug');
  logger.info('test info');
  logger.warn('test warn');
  logger.error(new Error('error message'), 'test error');
});

test('Logger - create PinoLogger child', async () => {
  const childLogger = logger.child('child');

  assert.ok(logger);
  childLogger.trace('test trace');
  childLogger.debug('test debug');
  childLogger.info('test info');
  childLogger.warn('test warn');
  childLogger.error(new Error('error message'), 'test error');
});

test('Telemetry - getHistogram keeps the attributes passed at get-time', async () => {
  const exporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE
  );
  const reader = new PeriodicExportingMetricReader({ exporter });
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));

  // setup telemetry
  OpenTelemetryService.Start(
    BC_NAME,
    APP_NAME,
    '0.0.0',
    INSTANCE_ID,
    new ConsoleLogger()
  );

  const telemetry = OpenTelemetryService.getInstance();

  telemetry.getHistogram('grpc_latency', { service: 'PAL' }).observe(1);

  const { resourceMetrics } = await reader.collect();
  const dataPoints = resourceMetrics.scopeMetrics[0].metrics[0].dataPoints;
  console.log({ dataPoints });
  const attributes = dataPoints[0].attributes;

  // the get-time label should ride on the measurement (currently dropped)
  assert.deepEqual(attributes, { service: 'PAL' });
});

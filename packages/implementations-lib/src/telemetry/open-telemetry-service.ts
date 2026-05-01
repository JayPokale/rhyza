/* eslint-disable @typescript-eslint/no-unused-vars */
import { ILogger, TelemetryService } from 'common-types-lib';
import process from 'process';
import { NodeTracerProvider } from '@opentelemetry/node';

import { Resource, resourceFromAttributes } from '@opentelemetry/resources';

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions/incubating';
import { FastifyOtelInstrumentation } from '@fastify/otel';
import {
  Attributes,
  Counter,
  Gauge,
  Histogram,
  MetricOptions,
  metrics
} from '@opentelemetry/api';

const OPEN_TELEMETRY_COLLECTOR_URL =
  process.env['OPEN_TELEMETRY_COLLECTOR_URL'] || 'http://127.0.0.1:4317';

export class OpenTelemetryService implements TelemetryService {
  private logger: ILogger;
  private bcName: string;
  private appName: string;
  private appVersion: string;
  private instanceId: string;
  private counters: Map<string, Counter>;

  private histograms: Map<string, Histogram>;
  private gauges: Map<string, Gauge>;

  fastifyOtelInstrumentation?: FastifyOtelInstrumentation;
  // private _provider: NodeTracerProvider;

  private static instance: OpenTelemetryService;

  private constructor(
    bcName: string,
    appName: string,
    appVersion: string,
    instanceId: string,
    logger: ILogger,
    collectorUrl?: string
  ) {
    this.bcName = bcName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.instanceId = instanceId;
    this.logger = logger;
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
  }

  static getInstance(): TelemetryService {
    if (this.instance) return this.instance;

    throw new Error(
      'Called OpenTelemetryServiceClient.getInstance() before OpenTelemetryClient.Start()'
    );
  }

  static Start(
    bcName: string,
    appName: string,
    appVersion: string,
    instanceId: string,
    logger: ILogger,
    collectorUrl?: string
  ) {
    if (this.instance) {
      throw new Error(
        'Called OpenTelemetryClient.start() a second time - already started'
      );
    }

    if (!collectorUrl) {
      collectorUrl = OPEN_TELEMETRY_COLLECTOR_URL;
    }

    const commonResource: Resource = resourceFromAttributes({
      [ATTR_SERVICE_NAMESPACE]: bcName,
      [ATTR_SERVICE_NAME]: appName,
      [ATTR_SERVICE_VERSION]: appVersion,
      [ATTR_SERVICE_INSTANCE_ID]: instanceId
    });

    this.instance = new OpenTelemetryService(
      bcName,
      appName,
      appVersion,
      instanceId,
      logger
    );

    const metricExporterReader = new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: collectorUrl
      }),
      exportIntervalMillis: 1000
    });

    const traceExporter = new OTLPTraceExporter({
      url: collectorUrl
    });

    const sdk = new NodeSDK({
      resource: commonResource,
      traceExporter: traceExporter,
      metricReader: metricExporterReader
    });

    sdk.start();

    this.instance.fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
      // @ts-expect-error TODO fix fastify otel instrumentation
      servername: `${appName}_${instanceId}`
    });

    const tracerProvider = new NodeTracerProvider({
      // TODO: fix lint
      // @ts-expect-error type mismatch between opentelemetry libraries
      resource: commonResource,
      spanProcessors: [new BatchSpanProcessor(traceExporter)]
    });

    this.instance.fastifyOtelInstrumentation.setTracerProvider(tracerProvider);

    tracerProvider.register();

    registerInstrumentations({
      instrumentations: [
        // Fastify instrumentation expects HTTP instrumentation
        new HttpInstrumentation(),
        new PgInstrumentation()
      ]
    });

    this.instance.logger.info(
      `OpenTelemetryClient Started with - collector url: "${collectorUrl}"`
    );
  }

  private getOrCreateCounter(name: string, options?: MetricOptions): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        metrics.getMeter(this.appName).createCounter(name, options)
      );
    }
    return this.counters.get(name)!;
  }

  private getOrCreateHistogram(
    name: string,
    options?: MetricOptions
  ): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(
        name,
        metrics.getMeter(this.appName).createHistogram(name, options)
      );
    }
    return this.histograms.get(name)!;
  }

  public incrementCounter(
    name: string,
    amount: number,
    attributes: Attributes = {}
  ): void {
    this.getOrCreateCounter(name).add(amount, attributes);
  }

  private getOrCreateGauge(name: string, options?: MetricOptions): Gauge {
    let gauge = this.gauges.get(name);
    if (gauge) return gauge;

    gauge = metrics.getMeter(this.appName).createGauge(name, options);
    this.gauges.set(name, gauge);

    return gauge;
  }

  public updateGauge(
    name: string,
    value: number,
    attributes: Attributes = {}
  ): void {
    this.getOrCreateGauge(name).record(value, attributes);
  }

  public recordHistogram(
    name: string,
    value: number,
    attributes?: Attributes
  ): void {
    this.getOrCreateHistogram(name).record(value, attributes);
  }

  public startTimer(
    name: string,
    attributes: Attributes = {}
  ): (additionalAttributes?: Attributes) => void {
    const start = Date.now();
    return (additionalAttributes: Attributes = {}) => {
      this.recordHistogram(name, Date.now() - start, {
        ...attributes,
        ...additionalAttributes
      });
    };
  }
}

/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {ILogger, ITelemetryService} from "common-types-lib";
import process from "process";
import {NodeTracerProvider} from "@opentelemetry/node";

import {Resource, resourceFromAttributes} from "@opentelemetry/resources";

import {OTLPTraceExporter} from "@opentelemetry/exporter-trace-otlp-grpc";
import {MeterProvider, PeriodicExportingMetricReader} from "@opentelemetry/sdk-metrics";
import {OTLPMetricExporter} from "@opentelemetry/exporter-metrics-otlp-grpc";
import {api, NodeSDK} from "@opentelemetry/sdk-node";
import {
    BatchSpanProcessor
} from "@opentelemetry/sdk-trace-node";
import {registerInstrumentations} from "@opentelemetry/instrumentation";
import {HttpInstrumentation} from "@opentelemetry/instrumentation-http";
import {PgInstrumentation} from "@opentelemetry/instrumentation-pg";
import {
    ATTR_SERVICE_INSTANCE_ID,
    ATTR_SERVICE_NAME,
    ATTR_SERVICE_NAMESPACE, ATTR_SERVICE_VERSION
} from "@opentelemetry/semantic-conventions/incubating";
import {FastifyOtelInstrumentation} from "@fastify/otel";
import {Attributes, Counter, Gauge, Histogram, MetricOptions, metrics} from "@opentelemetry/api";


// ENV VAR with DEFAULTS
const OPEN_TELEMETRY_COLLECTOR_URL = process.env["OPEN_TELEMETRY_COLLECTOR_URL"] || "http://127.0.0.1:4317";

export class OpenTelemetryServiceClient implements ITelemetryService {

    private _logger: ILogger;
    private _bcName: string;
    private _appName: string;
    private _appVersion: string;
    private _instanceId: string;
    private _counters: Map<string, Counter>;

    private _histograms: Map<string, Histogram>;
    private _gauges: Map<string, Gauge>;

    private _fastifyOtelInstrumentation?:FastifyOtelInstrumentation;
    // private _provider: NodeTracerProvider;

    private static _instance: OpenTelemetryServiceClient;

    private constructor(bcName: string, appName: string, appVersion: string, instanceId: string, logger: ILogger, collectorUrl?: string) {
        this._bcName = bcName;
        this._appName = appName;
        this._appVersion = appVersion;
        this._instanceId = instanceId;
        this._logger = logger;
        this._counters = new Map();
        this._histograms = new Map();
        this._gauges = new Map();
    }

    static getInstance():ITelemetryService{
        if (this._instance) return this._instance;

        throw new Error("Called OpenTelemetryServiceClient.getInstance() before OpenTelemetryClient.Start()");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static Start(bcName: string, appName: string, appVersion: string, instanceId: string, logger: ILogger, collectorUrl?: string) {
        if (this._instance) {
            throw new Error("Called OpenTelemetryClient.start() a second time - already started");
        }

        if (!collectorUrl) {
            collectorUrl = OPEN_TELEMETRY_COLLECTOR_URL;
        }

        const commonResource: Resource = resourceFromAttributes({
            [ATTR_SERVICE_NAMESPACE]: bcName,
            [ATTR_SERVICE_NAME]: appName,
            [ATTR_SERVICE_VERSION]: appVersion,
            [ATTR_SERVICE_INSTANCE_ID]: instanceId,
        });

        this._instance = new OpenTelemetryServiceClient(bcName, appName, appVersion, instanceId, logger);

        // this._instance._provider = new NodeTracerProvider({
        //     // @ts-ignore
        //     resource: commonResource,
        //     //sampler: sampler
        //     spanProcessors: [new BatchSpanProcessor(traceExporter)],
        // });

        const metricExporterReader = new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
                url: collectorUrl,
            }),
            exportIntervalMillis: 1000,
        });


        // const meterProvider = new MeterProvider({
        //     readers: [metricExporterReader],
        //     resource: commonResource,
        // });
        //
        // api.metrics.setGlobalMeterProvider(meterProvider);

        const traceExporter = new OTLPTraceExporter({
            url: collectorUrl,
        });

        const sdk = new NodeSDK({
            resource: commonResource,
            traceExporter: traceExporter,
            metricReader: metricExporterReader,
        });

        sdk.start();


        this._instance._fastifyOtelInstrumentation = new FastifyOtelInstrumentation({
            servername: `${appName}_${instanceId}`,
        });

        const tracerProvider = new NodeTracerProvider({
            // @ts-ignore
            resource: commonResource,
            spanProcessors: [new BatchSpanProcessor(traceExporter)],
        });

        this._instance._fastifyOtelInstrumentation.setTracerProvider(tracerProvider);
        // this._instance._fastifyOtelInstrumentation.setMeterProvider(metricExporterReader);

        tracerProvider.register();

        registerInstrumentations({
            instrumentations: [
                // Fastify instrumentation expects HTTP instrumentation
                new HttpInstrumentation(),
                new PgInstrumentation(),
                // this._instance._fastifyOtelInstrumentation
            ],
        });


        this._instance._logger.info(`OpenTelemetryClient Started with - collector url: "${collectorUrl}"`);
    }

    public get fastifyOtelInstrumentation(): FastifyOtelInstrumentation | undefined{
        return this._fastifyOtelInstrumentation;
    }

    private _getOrCreateCounter(name: string, options?: MetricOptions): Counter {
        if (!this._counters.has(name)) {
            this._counters.set(
                name,
                metrics.getMeter(this._appName).createCounter(name, options)
            );
        }
        return this._counters.get(name)!;
    }

    private _getOrCreateHistogram(name: string, options?: MetricOptions): Histogram {
        if (!this._histograms.has(name)) {
            this._histograms.set(
                name,
                metrics.getMeter(this._appName).createHistogram(name, options)
            );
        }
        return this._histograms.get(name)!;
    }

    public incrementCounter(name: string, amount: number, attributes: Attributes = {}): void {
        this._getOrCreateCounter(name).add(amount, attributes);
    }

    private _getOrCreateGauge(name: string, options?: MetricOptions): Gauge {
        let gauge = this._gauges.get(name);
        if (gauge) return gauge;



        gauge = metrics.getMeter(this._appName).createGauge(name, options);
        this._gauges.set(name, gauge);

        return gauge;
    }

    public updateGauge(name: string, value: number, attributes: Attributes = {}): void {
        this._getOrCreateGauge(name).record(value, attributes);
    }


    public recordHistogram(name: string, value: number, attributes?: Attributes): void {
        this._getOrCreateHistogram(name).record(value, attributes);
    }

    public startTimer(name: string,attributes: Attributes = {}): (additionalAttributes?: Attributes) => void {
        const start = Date.now();
        return (additionalAttributes: Attributes = {}) => {
            this.recordHistogram(name, Date.now() - start, {
                ...attributes,
                ...additionalAttributes,
            });
        };
    }
}

import { api } from "@opentelemetry/sdk-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";

const COLLECTOR_URL = process.env["OPEN_TELEMETRY_COLLECTOR_URL"];
if (!COLLECTOR_URL) {
  throw new Error("OPEN_TELEMETRY_COLLECTOR_URL is required");
}

const SERVICE_NAME = "RAFIKI_POC_PAYMENTS_SERVICE";

const metricExporter = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: COLLECTOR_URL,
  }),
  exportIntervalMillis: 1000,
});

const meterProvider = new MeterProvider({
  readers: [metricExporter],
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  }),
});

api.metrics.setGlobalMeterProvider(meterProvider);

const traceExporter = new OTLPTraceExporter({
  url: COLLECTOR_URL,
});

const tracerProvider = new NodeTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: SERVICE_NAME }),
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
});

tracerProvider.register();

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new PgInstrumentation(),
    new UndiciInstrumentation(),
    new IORedisInstrumentation(),
  ],
});

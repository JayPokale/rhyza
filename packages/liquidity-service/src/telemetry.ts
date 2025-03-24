import { api } from "@opentelemetry/sdk-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

const metricExporter = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: process.env["OPEN_TELEMETRY_COLLECTOR_URL"],
  }),
  exportIntervalMillis: 1000,
});

const meterProvider = new MeterProvider({
  readers: [metricExporter],
});

api.metrics.setGlobalMeterProvider(meterProvider);

registerInstrumentations({
  instrumentations: [new HttpInstrumentation()],
});

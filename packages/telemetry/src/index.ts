import {
  metrics,
  Counter,
  Histogram,
  Attributes,
  MetricOptions,
} from "@opentelemetry/api";

const METER_NAME = "rafiki-poc";

/**
 * Expects consumer (api, payments-server, etc.) to setGlobalMeterProvider on start.
 */
export class TelemetryService {
  private static instance: TelemetryService;
  private counters: Map<string, Counter>;
  private histograms: Map<string, Histogram>;

  private constructor(serviceName: string, collectorUrl: string) {
    this.counters = new Map();
    this.histograms = new Map();
  }

  static getInstance(config: {
    serviceName: string;
    collectorUrl: string;
  }): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(
        config.serviceName,
        config.collectorUrl
      );
    }
    return TelemetryService.instance;
  }

  private getOrCreateCounter(name: string, options?: MetricOptions): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        metrics.getMeter(METER_NAME).createCounter(name, options)
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
        metrics.getMeter(METER_NAME).createHistogram(name, options)
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
        ...additionalAttributes,
      });
    };
  }
}

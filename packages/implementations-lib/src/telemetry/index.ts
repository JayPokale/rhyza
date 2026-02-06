'use strict'

import {
  metrics,
  Counter,
  Histogram,
  Gauge,
  Attributes,
  MetricOptions
} from '@opentelemetry/api'
import { ITelemetryService } from 'common-types-lib'

const METER_NAME = 'rafiki-poc'

// export interface ITelemetryService {
//  incrementCounter(name: string, amount: number, attributes?: Attributes): void;
//  startTimer(
//      name: string,
//      attributes?: Attributes
//  ): (additionalAttributes?: Attributes) => void;
//  recordHistogram(name: string, value: number, attributes?: Attributes): void;
//  updateGauge(name: string, value: number,  attributes?: Attributes): void;
// }

/**
 * Expects consumer (api, payments-server, etc.) to setGlobalMeterProvider on start.
 */
export class TelemetryService implements ITelemetryService {
  private static instance: TelemetryService
  private counters: Map<string, Counter>
  private histograms: Map<string, Histogram>
  private gauges: Map<string, Gauge>
  private _serviceName: string
  private _collectorUrl: string
  private _instanceId: string

  private constructor(
    serviceName: string,
    collectorUrl: string,
    instanceId: string
  ) {
    this._serviceName = serviceName
    this._collectorUrl = collectorUrl
    this._instanceId = instanceId

    this.counters = new Map()
    this.histograms = new Map()
    this.gauges = new Map()
  }

  static getInstance(config: {
    serviceName: string
    collectorUrl: string
    instanceId: string
  }): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(
        config.serviceName,
        config.collectorUrl,
        config.instanceId
      )
    }
    return TelemetryService.instance
  }

  private getOrCreateCounter(name: string, options?: MetricOptions): Counter {
    if (!this.counters.has(name)) {
      this.counters.set(
        name,
        metrics.getMeter(METER_NAME, undefined, {}).createCounter(name, options)
      )
    }
    return this.counters.get(name)!
  }

  private getOrCreateHistogram(
    name: string,
    options?: MetricOptions
  ): Histogram {
    if (!this.histograms.has(name)) {
      this.histograms.set(
        name,
        metrics.getMeter(METER_NAME).createHistogram(name, options)
      )
    }
    return this.histograms.get(name)!
  }

  public incrementCounter(
    name: string,
    amount: number,
    attributes: Attributes = {}
  ): void {
    this.getOrCreateCounter(name).add(amount, attributes)
  }

  private getOrCreateGauge(name: string, options?: MetricOptions): Gauge {
    let gauge = this.gauges.get(name)
    if (gauge) return gauge

    gauge = metrics.getMeter(METER_NAME).createGauge(name, options)
    this.gauges.set(name, gauge)

    return gauge
  }

  public updateGauge(
    name: string,
    value: number,
    attributes: Attributes = {}
  ): void {
    this.getOrCreateGauge(name).record(value, attributes)
  }

  public recordHistogram(
    name: string,
    value: number,
    attributes?: Attributes
  ): void {
    this.getOrCreateHistogram(name).record(value, attributes)
  }

  public startTimer(
    name: string,
    attributes: Attributes = {}
  ): (additionalAttributes?: Attributes) => void {
    const start = Date.now()
    return (additionalAttributes: Attributes = {}) => {
      this.recordHistogram(name, Date.now() - start, {
        ...attributes,
        ...additionalAttributes
      })
    }
  }
}

"use strict";


// this must be compatible with opentelemetry/api Attributes
export interface Attributes {
    [attributeKey: string]: string | number | boolean | undefined;
}

export interface ITelemetryService {
    incrementCounter(name: string, amount: number, attributes?: Attributes): void;

    startTimer(
        name: string,
        attributes?: Attributes
    ): (additionalAttributes?: Attributes) => void;

    recordHistogram(name: string, value: number, attributes?: Attributes): void;

    updateGauge(name: string, value: number, attributes?: Attributes): void;
}

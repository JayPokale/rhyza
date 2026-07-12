export interface ITelemetryServiceAttributes {
  [attributeKey: string]: string | number | boolean | undefined;
}

export interface ITelemetryHistogram{
  observe(value: number): void;
  observe(value: number, attributes?: ITelemetryServiceAttributes): void;
  startTimer(attributes?: ITelemetryServiceAttributes): (additionalAttributes?: ITelemetryServiceAttributes) => void;
}

export interface ITelemetryGauge{
  set(value:number, attributes?: ITelemetryServiceAttributes):void;
}

export interface ITelemetryCounter{
  inc(amount?:number, attributes?: ITelemetryServiceAttributes):void;
  dec(amount?:number, attributes?: ITelemetryServiceAttributes ):void;
}


export interface ITelemetryService {
  incrementCounter(name: string, amount: number, attributes?: ITelemetryServiceAttributes): void;
  startTimer(
    name: string,
    attributes?: ITelemetryServiceAttributes
  ): (additionalAttributes?: ITelemetryServiceAttributes) => void;
  recordHistogram(name: string, value: number, attributes?: ITelemetryServiceAttributes): void;
  updateGauge(name: string, value: number, attributes?: ITelemetryServiceAttributes): void;

  // new methods
  getHistogram(name: string, attributes?: ITelemetryServiceAttributes): ITelemetryHistogram;
  getGauge(name: string, attributes?: ITelemetryServiceAttributes): ITelemetryGauge;
  getCounter(name: string, attributes?: ITelemetryServiceAttributes): ITelemetryCounter;
}

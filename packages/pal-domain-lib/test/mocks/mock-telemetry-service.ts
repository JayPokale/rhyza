import {
  ITelemetryCounter,
  ITelemetryGauge,
  ITelemetryHistogram,
  ITelemetryService,
  ITelemetryServiceAttributes
} from 'common-types-lib';

export class MockTelemetryService implements ITelemetryService {
  incrementCounter(): void {}
  startTimer(): (additionalAttributes?: ITelemetryServiceAttributes) => void {
    return () => {};
  }
  recordHistogram(): void {}
  updateGauge(): void {}

  getHistogram(): ITelemetryHistogram {
    return {
      observe: () => {},
      startTimer: () => () => {}
    };
  }
  getGauge(): ITelemetryGauge {
    return { set: () => {} };
  }
  getCounter(): ITelemetryCounter {
    return { inc: () => {}, dec: () => {} };
  }
}

require("./telemetry.js"); // Load telemetry before running the rest of the app

import { createApp } from "./app";
import {
  paymentService,
  ilpConnector,
  remoteIncomingPaymentService,
  init as initPaymentService,
} from "payments-service";
import { TelemetryService } from "telemetry";
import logger from "./logger";

(async () => {
  await initPaymentService();

  const start = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    paymentService,
    remoteIncomingPaymentService,
    ilpConnector,
    TelemetryService.getInstance({
      serviceName: "api",
      collectorUrl:
        process.env["OPEN_TELEMETRY_COLLECTOR_URL"] ||
        "http://otel-collector:4317",
    })
  );

  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

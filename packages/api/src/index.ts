require("./telemetry.js"); // Load telemetry before running the rest of the app

import { createApp } from "./app";
import {
  ilpConnector,
  remoteIncomingPaymentService,
} from "payments-service/dist/public";
import { TelemetryService } from "telemetry";
import logger from "./logger";
import { Kafka } from "kafkajs";

(async () => {
  const kafkaClient = new Kafka({
    clientId: "api",
    brokers: [process.env["KAFKA_URL"] || "kafka:29092"],
  });

  const producer = kafkaClient.producer();

  await producer.connect();

  const consumer = kafkaClient.consumer({
    groupId: `rafiki-events-${crypto.randomUUID()}`,
  });

  await consumer.connect();

  // Init Producer/Consumer:
  const telemetryService = TelemetryService.getInstance({
    serviceName: "api",
    collectorUrl:
      process.env["OPEN_TELEMETRY_COLLECTOR_URL"] ||
      "http://otel-collector:4317",
  });

  const start = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    remoteIncomingPaymentService,
    ilpConnector,
    telemetryService,
    producer,
    consumer
  );

  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

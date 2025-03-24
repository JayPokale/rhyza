import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions
} from "payments-service/dist/message-broker";

require("./telemetry.js"); // Load telemetry before running the rest of the app

import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions,
} from "payments-service/dist/message-broker";
import { createApp } from "./app";
import {
  ilpConnector,
  remoteIncomingPaymentService,
} from "payments-service/dist/public";
import logger from "./logger";

(async () => {
  //Kafka:
  const kafkaUrl = process.env["KAFKA_URL"] || "kafka:29092";
  const kafkaProducerCommonOptions: RafikiKafkaJsonProducerOptions = {
    kafkaBrokerList: kafkaUrl,
    producerClientId: `rafiki-producer-api-${crypto.randomUUID()}`,
  };
  const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
    kafkaBrokerList: kafkaUrl,
    // Event received by all api instances, but ignored where not applicable:
    kafkaGroupId: `rafiki-events-${crypto.randomUUID()}`,
  };
  logger.info(`Init Kafka on '${kafkaUrl}'`);

  // Init Producer/Consumer:
  const producer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions);
  await producer.connect();
  const consumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions);

  const start = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    remoteIncomingPaymentService,
    ilpConnector,
    producer,
    consumer
  );

  await start();

  process.on("SIGINT", () => {
    logger.info("Received SIGINT. Shutting down gracefully...");
    process.exit(0);
  });
})();

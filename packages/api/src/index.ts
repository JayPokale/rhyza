import {
  RafikiKafkaJsonConsumer,
  RafikiKafkaJsonConsumerOptions,
  RafikiKafkaJsonProducer,
  RafikiKafkaJsonProducerOptions
} from "payments-service/dist/message-broker";

require("./telemetry.js"); // Load telemetry before running the rest of the app

import { createApp } from "./app";
import {
  paymentService,
  ilpConnector,
  remoteIncomingPaymentService,
  init as initPaymentService,
} from "payments-service";
import logger from "./logger";

(async () => {
  await initPaymentService();

  //Kafka:
  const kafkaUrl = process.env["KAFKA_URL"] || "kafka:29092"
  const kafkaProducerCommonOptions: RafikiKafkaJsonProducerOptions = {
    kafkaBrokerList: kafkaUrl,
    producerClientId: `rafiki-${crypto.randomUUID()}`,
  }
  const kafkaConsumerCommonOptions: RafikiKafkaJsonConsumerOptions = {
    kafkaBrokerList: kafkaUrl,
    kafkaGroupId: `rafiki-events-${crypto.randomUUID()}`
  }
  logger.info(`Init Kafka on '${kafkaUrl}'`)

  // Init Producer/Consumer:
  const producer = new RafikiKafkaJsonProducer(kafkaProducerCommonOptions)
  await producer.connect()
  let consumer = new RafikiKafkaJsonConsumer(kafkaConsumerCommonOptions)

  const start = createApp(
    Number(process.env["API_PORT"] ?? 3000),
    paymentService,
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

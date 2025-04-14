import logger from "./logger";
import { PaymentService } from "./payment";
import { RafikiCommandHandler } from "./message-broker/command-handler/handler";
import type { ITelemetryService } from "telemetry";
import { Consumer, Producer } from "kafkajs";

export function createAppCommandHandler(
  paymentService: PaymentService,
  msgProducer: Producer,
  msgConsumer: Consumer,
  telemetryService: ITelemetryService
) {
  const rafikiCommandHandler = new RafikiCommandHandler(
    msgConsumer,
    msgProducer,
    paymentService,
    telemetryService
  );
  return async () => {
    logger.info(`🥺🥺🥺 Starting Rafiki Command Handler::: ->`);
    await rafikiCommandHandler.start();
    logger.info(`🚀🚀🚀 Rafiki Command Handler started`);
    return rafikiCommandHandler;
  };
}

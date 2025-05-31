import logger from "./logger";
import { PaymentService } from "./payment";
import { IMessageConsumer, IMessageProducer } from "./message-broker/message";
import { RafikiCommandHandler } from "./message-broker/command-handler/handler";
import type { ITelemetryService } from "telemetry";
import { RafikiEventHandler } from "./message-broker/event-handler/handler";

export function createAppCommandHandler(
  paymentService: PaymentService,
  msgProducer: IMessageProducer,
  msgConsumer: IMessageConsumer,
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

export function createAppEventHandler(
  paymentService: PaymentService,
  msgProducer: IMessageProducer,
  msgConsumer: IMessageConsumer,
  telemetryService: ITelemetryService
) {
  const rafikiCommandHandler = new RafikiEventHandler(
    msgConsumer,
    msgProducer,
    paymentService,
    telemetryService
  );
  return async () => {
    logger.info(`🥺🥺🥺 Starting Rafiki Event Handler::: ->`);
    await rafikiCommandHandler.start();
    logger.info(`🚀🚀🚀 Rafiki Event Handler started`);
    return rafikiCommandHandler;
  };
}

import logger from "./logger";
import {PaymentService} from "./payment";
import {IMessageConsumer, IMessageProducer} from "./message-broker/message";
import {RafikiCommandHandler} from "./message-broker/command-handler/handler";

export function createAppCommandHandler(
  paymentService: PaymentService,
  msgProducer: IMessageProducer,
  msgConsumer: IMessageConsumer
) {
  const rafikiCommandHandler = new RafikiCommandHandler(msgConsumer, msgProducer, paymentService)
  return async () => {
    logger.info(`🥺🥺🥺 Starting Rafiki Command Handler::: ->`)
    await rafikiCommandHandler.start()
    logger.info(`🚀🚀🚀 Rafiki Command Handler started`)
    return rafikiCommandHandler
  }
}


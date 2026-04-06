
import {
  ILogger,
  IMessageProducer,
  IMessageConsumer,
  StateEventTopics,
  IMessage,
  DomainEventTopics
} from "common-types-lib";

export class IntegrationEventHandler {
  private readonly _logger: ILogger;
  private readonly _msgConsumer: IMessageConsumer;
  private readonly _msgProducer: IMessageProducer;

  constructor(messageConsumer: IMessageConsumer, msgProducer: IMessageProducer, logger: ILogger) {
    this._logger = logger;
    this._msgConsumer = messageConsumer;
    this._msgProducer = msgProducer;
  }

  private async _handleIntegrationMessages(messages:  IMessage[]){
    this._logger.info(`Received ${messages.length} messages`);

    // TODO use correct event class names from the payments publict types lib
    //  (right now they are in the payments domain lib)
    for (const msg of messages) {
      if(msg.msgName === "PaymentIntentCreatedEvent") {
        // create a CheckBalanceAndReserveTransferCmd
      }else if(msg.msgName === "PaymentCreatedEvent") {
        // create a CommitTransferCmd
      }else if(msg.msgName === "PaymentCreateFailedEvent") {
        // create a RejectTransferCmd
      }
    }
  }


  async init():Promise<void>{
    this._msgConsumer.setTopics([DomainEventTopics.PaymentEvents]);
    this._msgConsumer.setBatchCallbackFn(this._handleIntegrationMessages.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();

    this._logger.info(`${this.constructor.name} initialized`);
  }

  async destroy():Promise<void>{
    await this._msgConsumer.stop();
    return;
  }

}

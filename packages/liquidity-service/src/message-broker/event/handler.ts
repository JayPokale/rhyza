import { IMessage, IMessageConsumer, IMessageProducer } from "../message";

import logger from "../../logger";
import {
  AssetCreatedEventPayload,
  IlpPeerCreatedEventPayload,
  Topic,
  WalletAddressCreatedEventPayload,
} from ".";
import { LiquidityService } from "../../liquidity";

export class LiquidityServiceEventHandler {
  constructor(
    private messageConsumer: IMessageConsumer,
    private liquidityService: LiquidityService
  ) {}

  async start(): Promise<void> {
    this.messageConsumer.setTopics([
      Topic.AssetCreatedEvent,
      Topic.IlpPeerCreatedEvent,
      Topic.WalletAddressCreatedEvent,
    ]);
    this.messageConsumer.setCallbackFn(this._msgHandler.bind(this));
    await this.messageConsumer.connect();
    await this.messageConsumer.startAndWaitForRebalance();
  }

  private async _msgHandler(message: IMessage): Promise<void> {
    // eslint-disable-next-line no-async-promise-executor
    return await new Promise<void>(async (resolve) => {
      logger.debug(
        { message },
        `Liquidity Service Event Handler: Received event`
      );
      try {
        switch (message.msgName) {
          case Topic.AssetCreatedEvent:
            await this.liquidityService.createAssetAccount(
              (message.payload as AssetCreatedEventPayload).asset
            );
            break;
          case Topic.IlpPeerCreatedEvent:
            await this.liquidityService.createIlpPeerAccount(
              (message.payload as IlpPeerCreatedEventPayload).peer
            );
            break;
          case Topic.WalletAddressCreatedEvent:
            await this.liquidityService.createWalletAddressAccount(
              (message.payload as WalletAddressCreatedEventPayload)
                .walletAddress
            );
            break;

          default: {
            logger.warn(
              `RafikiCommandHandler - unknown command - msgName: ${message?.msgName} msgKey: ${message?.msgKey} msgId: ${message?.msgId}`
            );
          }
        }
      } catch (err) {
        logger.error(
          `RafikiCommandHandler - error processing command - ${
            message?.msgName
          }:${message?.msgKey}:${message?.msgId} - Error: ${(
            err as Error
          )?.message?.toString()}`,
          err
        );
        logger.error({ err }, "CommandHandler -> Payload for error:");
      } finally {
        logger.debug(`CommandHandler: Done`);
        resolve();
      }
    });
  }

  async stop(): Promise<void> {
    await this.messageConsumer.stop();
  }
}

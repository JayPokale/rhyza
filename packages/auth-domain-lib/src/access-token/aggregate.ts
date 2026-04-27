import { Message } from 'common-types-lib';
import {
  CreateAccessTokenCommand,
  RotateAccessTokenCmd,
  RevokeAccessTokenCommand
} from '../commands';
import { AccessTokenEntity } from './entity';
import { IAccessToken } from './interfaces';
import { DuplicateAccessTokenError, AccessTokenNotFoundError } from './errors';
import {
  AccessTokenCreatedEvent,
  AccessTokenCreateFailedEvent,
  AccessTokenRotatedEvent,
  AccessTokenRotateFailedEvent,
  AccessTokenRevokedEvent,
  AccessTokenRevokeFailureEvent
} from './events';

export interface IAccessTokenService {
  fetchByValues(values: string[]): Promise<IAccessToken[]>;
}

export class AccessTokenAggregate {
  private accessTokenMap = new Map<string, IAccessToken>();

  constructor(private _accessTokenService: IAccessTokenService) {}

  async handleBatch(cmds: Message[]): Promise<{ events: Message[] }> {
    const outputEvents: Message[] = [];
    const accessTokenSet = new Set<string>();

    for (const cmd of cmds) {
      if (cmd.msgName === CreateAccessTokenCommand.name) {
        const payload = (cmd as CreateAccessTokenCommand).payload;
        accessTokenSet.add(payload.value);
      } else if (cmd.msgName === RotateAccessTokenCmd.name) {
        const payload = (cmd as RotateAccessTokenCmd).payload;
        accessTokenSet.add(payload.oldAccessTokenValue);
      } else if (cmd.msgName === RevokeAccessTokenCommand.name) {
        const payload = (cmd as RevokeAccessTokenCommand).payload;
        accessTokenSet.add(payload.value);
      }
    }

    const accessTokens = await this._accessTokenService.fetchByValues([
      ...accessTokenSet
    ]);
    for (const accessToken of accessTokens) {
      this.accessTokenMap.set(accessToken.value, accessToken);
    }

    for (const cmd of cmds) {
      let event: Message;
      if (cmd.msgName === CreateAccessTokenCommand.name) {
        event = this.handleCreateAccessTokenCommand(
          cmd as CreateAccessTokenCommand
        );
      } else if (cmd.msgName === RotateAccessTokenCmd.name) {
        event = this.handleRotateAccessTokenCommand(
          cmd as RotateAccessTokenCmd
        );
      } else if (cmd.msgName === RevokeAccessTokenCommand.name) {
        event = this.handleRevokeAccessTokenCommand(
          cmd as RevokeAccessTokenCommand
        );
      } else {
        throw new Error('Unexpected command');
      }

      outputEvents.push(event);
    }

    return { events: outputEvents };
  }

  private handleCreateAccessTokenCommand(
    cmd: CreateAccessTokenCommand
  ): Message {
    try {
      const { value, managementId, expiresIn, grantId } = cmd.payload;

      if (this.accessTokenMap.has(value)) {
        throw new DuplicateAccessTokenError(
          `AccessToken with value ${value} already exists`
        );
      }

      const entity = AccessTokenEntity.fromObject({
        value,
        grantId,
        managementId,
        expiresIn,
        createdAt: new Date()
      });

      this.accessTokenMap.set(value, entity.toObject());

      return new AccessTokenCreatedEvent({ value }, cmd.requestId);
    } catch (err) {
      return new AccessTokenCreateFailedEvent(
        {
          errorName: (err as Error).name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleRotateAccessTokenCommand(cmd: RotateAccessTokenCmd): Message {
    try {
      const {
        oldAccessTokenValue,
        newAccessTokenValue,
        managementId,
        expiresIn
      } = cmd.payload;

      const accessTokenObj = this.accessTokenMap.get(oldAccessTokenValue);
      if (!accessTokenObj) {
        throw new AccessTokenNotFoundError(
          `AccessToken ${oldAccessTokenValue} not found`
        );
      }

      const entity = AccessTokenEntity.fromObject(accessTokenObj);
      entity.revoke();

      if (this.accessTokenMap.has(newAccessTokenValue)) {
        throw new DuplicateAccessTokenError(
          `AccessToken with value ${newAccessTokenValue} already exists`
        );
      }

      const newAccessToken = AccessTokenEntity.fromObject({
        value: newAccessTokenValue,
        grantId: entity.grantId,
        managementId,
        expiresIn,
        createdAt: new Date()
      });
      this.accessTokenMap.set(newAccessTokenValue, newAccessToken.toObject());

      return new AccessTokenRotatedEvent(
        { oldAccessTokenValue, newAccessTokenValue },
        cmd.requestId
      );
    } catch (err) {
      return new AccessTokenRotateFailedEvent(
        {
          errorName: (err as Error).name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleRevokeAccessTokenCommand(
    cmd: RevokeAccessTokenCommand
  ): Message {
    try {
      const { value } = cmd.payload;

      const accessTokenObj = this.accessTokenMap.get(value);
      if (!accessTokenObj) {
        throw new AccessTokenNotFoundError(`AccessToken ${value} not found`);
      }

      const entity = AccessTokenEntity.fromObject(accessTokenObj);
      entity.revoke(new Date());

      this.accessTokenMap.set(value, entity.toObject());

      return new AccessTokenRevokedEvent({ value }, cmd.requestId);
    } catch (err) {
      return new AccessTokenRevokeFailureEvent(
        {
          errorName: (err as Error).name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }
}

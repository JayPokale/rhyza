import { Message } from 'common-types-lib';
import {
  FinalizeGrantCmd,
  CreateGrantCmd,
  RotateAccessTokenCmd,
  RevokeAccessTokenCmd,
  InteractionChoiceCommand
} from '../commands';
import { DuplicateGrantError, GrantNotFoundError } from './errors';
import {
  GrantCreatedEvent,
  GrantCreateFailedEvent,
  GrantFinalizedEvent,
  GrantFinalizedFailedEvent,
  GrantInteractionChoiceEvent,
  GrantInteractionChoiceFailureEvent,
  GrantTokenRevokedEvent,
  GrantTokenRevokeFailureEvent,
  GrantTokenRotatedEvent,
  GrantTokenRotateFailedEvent
} from './events';
import {
  AccessAction,
  AccessType,
  GrantFinalization,
  GrantState,
  IAccessItem,
  IAccessLimit,
  IAccessToken,
  IFinishMethod,
  IGrant,
  IGrantService,
  InteractionChoice,
  IStartMethod,
  ISubject
} from './interfaces';
import { GrantEntity } from './entity';

export class GrantAggregate {
  private grantMap = new Map<string, IGrant>();

  constructor(private _grantService: IGrantService) {}

  async handleBatch(cmds: Message[]): Promise<{ events: Message[] }> {
    const outputEvents: Message[] = [];

    const grantIdSet = new Set<string>();
    for (const cmd of cmds) {
      if (cmd.msgName === CreateGrantCmd.name) {
        const payload = (cmd as CreateGrantCmd).payload;
        grantIdSet.add(payload.id);
      } else if (cmd.msgName === FinalizeGrantCmd.name) {
        const payload = (cmd as FinalizeGrantCmd).payload;
        grantIdSet.add(payload.id);
      } else if (cmd.msgName === RotateAccessTokenCmd.name) {
        const payload = (cmd as RotateAccessTokenCmd).payload;
        grantIdSet.add(payload.id);
      } else if ((cmd.msgName = RevokeAccessTokenCmd.name)) {
        const payload = (cmd as RevokeAccessTokenCmd).payload;
        grantIdSet.add(payload.id);
      } else if ((cmd.msgName = InteractionChoiceCommand.name)) {
        const payload = (cmd as InteractionChoiceCommand).payload;
        grantIdSet.add(payload.id);
      }

      const grants = await this._grantService.fetchByIds([...grantIdSet]);

      for (const grant of grants) {
        this.grantMap.set(grant.id, grant);
      }

      for (const cmd of cmds) {
        let event: Message;
        if (cmd.msgName == CreateGrantCmd.name) {
          event = this.handleCreateGrantCommand(cmd as CreateGrantCmd);
        } else if (cmd.msgName === FinalizeGrantCmd.name) {
          event = this.handleFinalizeGrantCommand(cmd as FinalizeGrantCmd);
        } else if (cmd.msgName === RotateAccessTokenCmd.name) {
          event = this.handleRotateTokenCommand(cmd as RotateAccessTokenCmd);
        } else if (cmd.msgName === RevokeAccessTokenCmd.name) {
          event = this.handleRevokeTokenCommand(cmd as RevokeAccessTokenCmd);
        } else if (cmd.msgName === InteractionChoiceCommand.name) {
          event = this.handleInteractionChoiceCommand(
            cmd as InteractionChoiceCommand
          );
        } else {
          throw new Error('Unexpected command');
        }

        outputEvents.push(event);
      }
    }
    return { events: outputEvents };
  }

  private handleCreateGrantCommand(cmd: CreateGrantCmd) {
    try {
      const { id } = cmd.payload;
      if (this.grantMap.has(id)) {
        throw new DuplicateGrantError(`Grant with id ${id} already exists`);
      }

      // TODO verify state & start methods are in enum
      // TODO

      const accessItems: IAccessItem[] | undefined = cmd.payload.access?.map(
        (access) => {
          return {
            ...access,
            type: access.type as AccessType,
            actions: access.actions as AccessAction[],
            limits: access.limits as IAccessLimit
          };
        }
      );

      const entity = GrantEntity.fromObject({
        ...cmd.payload,
        state: cmd.payload.state as GrantState,
        startMethods: cmd.payload.startMethods as IStartMethod[],
        finishMethod: cmd.payload.finishMethod as IFinishMethod,
        subject: cmd.payload.subject as ISubject,
        accesses: accessItems,
        accessTokens: cmd.payload.accessToken ? [cmd.payload.accessToken] : []
      });

      this.grantMap.set(id, entity.toObject());

      return new GrantCreatedEvent(
        {
          id
        },
        cmd.requestId
      );
    } catch (err) {
      return new GrantCreateFailedEvent(
        {
          errorName: (err as Error).name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleFinalizeGrantCommand(cmd: FinalizeGrantCmd) {
    const { id, finalizationReason, accessToken } = cmd.payload;
    try {
      const grantObj = this.grantMap.get(id);
      if (!grantObj) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const grant = GrantEntity.fromObject(grantObj);
      grant.finalize(finalizationReason as GrantFinalization, accessToken);

      this.grantMap.set(id, grant.toObject());
      return new GrantFinalizedEvent({
        id,
        reason: finalizationReason as GrantFinalization
      });
    } catch (err) {
      return new GrantFinalizedFailedEvent({
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleRotateTokenCommand(cmd: RotateAccessTokenCmd) {
    const { id, newAccessToken, oldAccessToken } = cmd.payload;

    try {
      const grantObj = this.grantMap.get(id);
      if (!grantObj) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const grant = GrantEntity.fromObject(grantObj);
      grant.rotateAccessToken(oldAccessToken, newAccessToken);

      this.grantMap.set(id, grant.toObject());

      return new GrantTokenRotatedEvent({
        id,
        newAccessToken: newAccessToken.id
      });
    } catch (err) {
      return new GrantTokenRotateFailedEvent({
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleRevokeTokenCommand(cmd: RevokeAccessTokenCmd) {
    const { id } = cmd.payload;

    try {
      const grantObj = this.grantMap.get(id);
      if (!grantObj) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const grant = GrantEntity.fromObject(grantObj);
      grant.revokeAccessToken(cmd.payload);

      this.grantMap.set(id, grant.toObject());

      return new GrantTokenRevokedEvent({
        id,
        revokedAccessToken: cmd.payload.id
      });
    } catch (err) {
      return new GrantTokenRevokeFailureEvent({
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleInteractionChoiceCommand(cmd: InteractionChoiceCommand) {
    const { id, nonce, interactId, choice } = cmd.payload;

    try {
      const grantObj = this.grantMap.get(id);
      if (!grantObj) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const grant = GrantEntity.fromObject(grantObj);
      // TODO: validate choice as interactionChoice
      grant.handleInteractionChoice(
        interactId,
        nonce,
        choice as InteractionChoice
      );
      this.grantMap.set(id, grant.toObject());

      return new GrantInteractionChoiceEvent({
        id,
        interactId
      });
    } catch (err) {
      return new GrantInteractionChoiceFailureEvent({
        errName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }
}

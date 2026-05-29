import { IMessage } from 'common-types-lib';
import {
  ContinueGrantCmd,
  CreateGrantCmd,
  AcceptInteractionCommand,
  RejectInteractionCommand,
  RevokeGrantCmd,
  IntrospectTokenCmd,
  RotateTokenCmd,
  RevokeTokenCmd
} from '../commands';
import { DuplicateGrantError, GrantNotFoundError } from './errors';
import {
  GrantCreatedEvent,
  GrantCreateFailedEvent,
  GrantContinuedEvent,
  GrantContinueFailedEvent,
  GrantInteractionChoiceHandledEvent,
  GrantInteractionChoiceFailedEvent,
  GrantRevokedEvent,
  GrantRevokeFailedEvent,
  TokenIntrospectedEvent,
  TokenIntrospectionFailedEvent,
  TokenRotatedEvent,
  TokenRotationFailedEvent
} from './events';
import {
  AccessAction,
  AccessType,
  GrantFinalization,
  IAccessItem,
  IAccessLimit,
  IFinishMethod,
  IGrant,
  InteractionChoice,
  InteractionState,
  IStartMethod,
  ISubjectId
} from './interfaces';
import { GrantEntity } from './entity';

export interface IGrantService {
  fetchByIds(grantIds: string[]): Promise<IGrant[]>;
}

export class GrantAggregate {
  private grantMap = new Map<string, GrantEntity>();

  constructor(private _grantService: IGrantService) {}

  async handleBatch(cmds: IMessage[]): Promise<{ events: IMessage[] }> {
    const outputEvents: IMessage[] = [];

    const grantIdSet = new Set<string>();
    for (const cmd of cmds) {
      if (cmd.msgName === CreateGrantCmd.name) {
        const payload = (cmd as CreateGrantCmd).payload;
        grantIdSet.add(payload.id);
      } else if (cmd.msgName === ContinueGrantCmd.name) {
        const payload = (cmd as ContinueGrantCmd).payload;
        grantIdSet.add(payload.id);
      } else if (
        (cmd.msgName = AcceptInteractionCommand.name) ||
        (cmd.msgName = RejectInteractionCommand.name)
      ) {
        const payload = (
          cmd as AcceptInteractionCommand | RejectInteractionCommand
        ).payload;
        grantIdSet.add(payload.id);
      }

      const grants = await this._grantService.fetchByIds([...grantIdSet]);

      for (const grant of grants) {
        this.grantMap.set(grant.id, GrantEntity.fromObject(grant));
      }

      for (const cmd of cmds) {
        let event: IMessage;
        if (cmd.msgName == CreateGrantCmd.name) {
          event = this.handleCreateGrantCommand(cmd as CreateGrantCmd);
        } else if (cmd.msgName === ContinueGrantCmd.name) {
          event = this.handleContinueGrantCommand(cmd as ContinueGrantCmd);
        } else if (cmd.msgName === RevokeGrantCmd.name) {
          event = this.handleRevokeGrantCommand(cmd as RevokeGrantCmd);
        } else if (cmd.msgName === IntrospectTokenCmd.name) {
          event = this.handleIntrospectTokenCommand(cmd as IntrospectTokenCmd);
        } else if (cmd.msgName === RotateTokenCmd.name) {
          event = this.handleRotateTokenCommand(cmd as RotateTokenCmd);
        } else if (cmd.msgName === RevokeTokenCmd.name) {
          event = this.handleRevokeTokenCommand(cmd as RevokeTokenCmd);
        } else if (cmd.msgName === AcceptInteractionCommand.name) {
          event = this.handleAcceptInteractionCommand(
            cmd as AcceptInteractionCommand
          );
        } else if (cmd.msgName === RejectInteractionCommand.name) {
          event = this.handleRejectInteractionCommand(
            cmd as RejectInteractionCommand
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

      const { entity, accessToken } = GrantEntity.create({
        ...cmd.payload,
        startMethods: cmd.payload.interact?.start as IStartMethod[],
        finishMethod: cmd.payload.interact?.finish?.method as IFinishMethod,
        subjectIds: cmd.payload.subjectIds as ISubjectId[],
        accesses: accessItems
      });

      this.grantMap.set(id, entity);

      return new GrantCreatedEvent({
        id,
        continueId: entity.continueId,
        continueToken: entity.continueToken,
        interactNonce: entity.interaction?.clientNonce,
        accessTokenValue: accessToken?.value,
        accessTokenManagementId: accessToken?.managementId,
        accessTokenExpiresIn: accessToken?.expiresInMs,
        access: entity.accesses,
        subjectIds: entity.subjectIds
      });
    } catch (err) {
      return new GrantCreateFailedEvent({
        grantId: cmd.payload.id,
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleContinueGrantCommand(cmd: ContinueGrantCmd) {
    const { id, continueId, continueToken, interactRef } = cmd.payload;
    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const accessToken = grant.continue(
        continueToken,
        continueId,
        interactRef
      );

      this.grantMap.set(id, grant);
      return new GrantContinuedEvent({
        id,
        finalizationReason: grant.finalizationReason as GrantFinalization,
        accessTokenValue: accessToken?.value,
        accessTokenManagementId: accessToken?.managementId,
        accessTokenExpiresIn: accessToken?.expiresInMs,
        access: grant.accesses,
        continueId: grant.continueId,
        continueToken: grant.continueToken
      });
    } catch (err) {
      return new GrantContinueFailedEvent({
        grantId: cmd.payload.id,
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleRevokeGrantCommand(cmd: RevokeGrantCmd) {
    const { id, continueId, continueToken } = cmd.payload;

    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      grant.revoke(continueToken, continueId);

      this.grantMap.set(id, grant);
      return new GrantRevokedEvent({
        id
      });
    } catch (error) {
      return new GrantRevokeFailedEvent({
        grantId: id,
        errorName: (error as Error).name,
        message: (error as Error).message
      });
    }
  }

  private handleIntrospectTokenCommand(cmd: IntrospectTokenCmd) {
    const { id, tokenValue, access } = cmd.payload;
    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const accessToken = grant.introspectAccessToken(tokenValue, access);

      this.grantMap.set(id, grant);
      return new TokenIntrospectedEvent({
        id,
        active: accessToken.active,
        access: accessToken.access
      });
    } catch (err) {
      return new TokenIntrospectionFailedEvent({
        grantId: cmd.payload.id,
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleRotateTokenCommand(cmd: RotateTokenCmd) {
    const { id, value, managementId } = cmd.payload;
    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      const accessToken = grant.rotateAccessToken(value, managementId);

      this.grantMap.set(id, grant);
      return new TokenRotatedEvent({
        id,
        newAccessTokenValue: accessToken.value,
        newAccessTokenManagementId: accessToken.managementId,
        newAccessTokenExpiresIn: accessToken.expiresInMs,
        access: grant.accesses
      });
    } catch (err) {
      return new TokenRotationFailedEvent({
        grantId: cmd.payload.id,
        errorName: (err as Error).name,
        message: (err as Error).message
      });
    }
  }

  private handleRevokeTokenCommand(cmd: RevokeTokenCmd) {
    const { id, value, managementId } = cmd.payload;

    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      grant.revokeAccessToken(value, managementId);
      this.grantMap.set(id, grant);

      return new GrantRevokedEvent({
        id
      });
    } catch (error) {
      return new GrantRevokeFailedEvent({
        grantId: id,
        errorName: (error as Error).name,
        message: (error as Error).message
      });
    }
  }

  private handleInteractionChoice(
    id: string,
    choice: InteractionChoice,
    interactRef?: string
  ) {
    try {
      const grant = this.grantMap.get(id);
      if (!grant) {
        throw new GrantNotFoundError(`Grant ${id} not found`);
      }

      grant.handleInteractionChoice(choice);
      this.grantMap.set(id, grant);

      return new GrantInteractionChoiceHandledEvent({
        id,
        interactRef
      });
    } catch (error) {
      return new GrantInteractionChoiceFailedEvent({
        grantId: id,
        errorName: (error as Error).name,
        message: (error as Error).message
      });
    }
  }

  private handleAcceptInteractionCommand(cmd: AcceptInteractionCommand) {
    const { id, interactRef } = cmd.payload;

    return this.handleInteractionChoice(
      id,
      InteractionState.APPROVED,
      interactRef
    );
  }

  private handleRejectInteractionCommand(cmd: RejectInteractionCommand) {
    const { id, interactRef } = cmd.payload;

    return this.handleInteractionChoice(
      id,
      InteractionState.DENIED,
      interactRef
    );
  }
}

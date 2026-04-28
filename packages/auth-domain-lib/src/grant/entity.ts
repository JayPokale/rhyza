import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import {
  InvalidGrantError,
  InvalidInteractionError,
  NonInteractiveGrantError,
  UnknownAccessTokenError,
  UnknownInteractionError
} from './errors';
import {
  IAccessItem,
  IFinishMethod,
  GrantState,
  IGrant,
  IInteraction,
  InteractionState,
  InteractionChoice,
  IStartMethod,
  ISubject,
  IGrantEntity,
  IAccessToken,
  NewAccessToken,
  RevokedAccessToken,
  GrantFinalization,
  InteractiveAccessType
} from './interfaces';

interface IGrantInput {
  id: string;
  startMethods: IStartMethod[];
  identifier: string;
  continueToken?: string;
  continueId?: string;
  state: GrantState;
  finalizationReason?: GrantFinalization;
  interaction?: IInteraction;
  client?: string;
  subject?: ISubject;
  accesses?: IAccessItem[];
  finishMethod?: IFinishMethod;
  finishUri?: string;
  lastContinuedAt?: Date;
}

export type CreateGrantInput = Omit<
  IGrantInput,
  'continueToken' | 'continueId' | 'state'
>;

export class GrantEntity implements IGrantEntity {
  private _id: string;
  private _startMethods: IStartMethod[];
  private _identifier: string;
  private _continueToken?: string;
  private _continueId?: string;
  private _state: GrantState;
  private _finalizationReason?: GrantFinalization;
  private _client?: string;
  private _subject?: ISubject;
  private _accesses?: IAccessItem[];
  private _finishMethod?: IFinishMethod;
  private _finishUri?: string;
  private _interaction?: IInteraction;
  private _lastContinuedAt?: Date;
  private _accessTokens: Map<string, IAccessToken> = new Map<
    string,
    IAccessToken
  >();

  private constructor(input: IGrantInput) {
    this._id = input.id;
    this._startMethods = input.startMethods;
    this._identifier = input.identifier;
    // TODO: optionally generate continue information for cases where grant is not continuable
    this._continueToken = crypto.randomBytes(16).toString('hex').toUpperCase();
    this._continueId = uuid();
    // TODO: determine state heuristically from inputs, with input.state as override
    this._state = input.state;

    this._client = input.client;
    this._subject = input.subject;
    this._accesses = input.accesses;
    this._finishMethod = input.finishMethod;
    this._finishUri = input.finishUri;
    this._interaction = input.interaction;
    this._lastContinuedAt = input.lastContinuedAt;
  }

  static fromObject(obj: IGrantInput): GrantEntity {
    return new GrantEntity(obj);
  }

  static create(input: CreateGrantInput): GrantEntity {
    const hasInteractiveAccessType = input.accesses?.some((access) =>
      InteractiveAccessType.includes(access.type)
    );

    const entity = new GrantEntity({
      ...input,
      state: hasInteractiveAccessType
        ? GrantState.PENDING
        : GrantState.FINALIZED,
      finalizationReason: !hasInteractiveAccessType
        ? GrantFinalization.ISSUED
        : undefined,
      continueToken: hasInteractiveAccessType
        ? crypto.randomBytes(16).toString('hex').toUpperCase()
        : undefined,
      continueId: hasInteractiveAccessType ? uuid() : undefined
    });

    if (!hasInteractiveAccessType) {
      entity.createAccessToken();
    }

    return entity;
  }

  toObject(): IGrant {
    return {
      id: this._id,
      interaction: this._interaction,
      startMethods: this._startMethods,
      identifier: this._identifier,
      continueToken: this._continueToken,
      continueId: this._continueId,
      state: this._state,
      finalizationReason: this._finalizationReason,
      client: this._client,
      subject: this._subject,
      accesses: this._accesses,
      finishMethod: this._finishMethod,
      finishUri: this._finishUri,
      lastContinuedAt: this._lastContinuedAt,
      accessTokens: this._accessTokens
    };
  }

  startInteraction(): IInteraction {
    if (!this._startMethods) {
      throw new NonInteractiveGrantError();
    }

    this._interaction = {
      interactRef: uuid(),
      clientNonce: crypto.randomBytes(16).toString('hex').toUpperCase(),
      expiresIn: Number(process.env.INTERACTION_EXPIRY_SECONDS),
      state: InteractionState.PENDING
    };

    return this._interaction;
  }

  handleInteractionChoice(choice: InteractionChoice) {
    if (!this._interaction) {
      throw new UnknownInteractionError();
    }

    if (this._interaction.state !== InteractionState.PENDING)
      throw new InvalidInteractionError();

    this._interaction.state = choice;
  }

  continueGrant(
    continueToken: string,
    continueId: string
  ): NewAccessToken | undefined {
    if (
      continueToken !== this.continueToken ||
      continueId !== this.continueId
    ) {
      throw new InvalidGrantError();
    }

    if (
      this._lastContinuedAt &&
      this._lastContinuedAt.getTime() + Number(process.env.GRANT_POLL_MS) <
        Date.now()
    ) {
      this._lastContinuedAt = new Date();
      throw new InvalidGrantError('Cannot continue grant too soon');
    }

    this._lastContinuedAt = new Date();

    if (!this._interaction) {
      throw new InvalidInteractionError();
    }

    if (
      this._state !== GrantState.PROCESSING &&
      this._state !== GrantState.PENDING
    ) {
      throw new InvalidGrantError(
        'Cannot continue grant that is not in processing or pending state'
      );
    }

    if (this._interaction.state === InteractionState.APPROVED) {
      this._state = GrantState.FINALIZED;
      this._finalizationReason = GrantFinalization.ISSUED;

      return this.createAccessToken();
    } else if (this._interaction.state === InteractionState.DENIED) {
      this._state = GrantState.FINALIZED;
      this._finalizationReason = GrantFinalization.REJECTED;
    }
  }

  createAccessToken(): NewAccessToken {
    const newAccessToken: NewAccessToken = {
      managementId: uuid(),
      value: crypto.randomBytes(10).toString('hex').toUpperCase(),
      expiresIn: Number(process.env.ACCESS_TOKEN_EXPIRY_SECONDS)
    };
    this._accessTokens.set(newAccessToken.value, newAccessToken);
    return newAccessToken;
  }

  revokeAccessToken(value: string): RevokedAccessToken {
    const accessToken = this._accessTokens.get(value);
    if (!accessToken) {
      throw new UnknownAccessTokenError();
    }
    accessToken.revokedAt = new Date();
    this._accessTokens.set(value, accessToken);
    return accessToken as RevokedAccessToken;
  }

  rotateAccessToken(value: string): NewAccessToken {
    if (this.state !== GrantState.APPROVED) {
      throw new InvalidGrantError();
    }
    this.revokeAccessToken(value);
    return this.createAccessToken();
  }

  get startMethods(): IStartMethod[] {
    return this._startMethods;
  }

  get identifier(): string {
    return this._identifier;
  }

  get continueToken(): string | undefined {
    return this._continueToken;
  }

  get continueId(): string | undefined {
    return this._continueId;
  }

  get state(): GrantState {
    return this._state;
  }

  get finalizationReason(): GrantFinalization | undefined {
    return this._finalizationReason;
  }

  get client(): string | undefined {
    return this._client;
  }

  get subject(): ISubject | undefined {
    return this._subject;
  }

  get accesses(): IAccessItem[] | undefined {
    return this._accesses;
  }

  get finishMethod(): IFinishMethod | undefined {
    return this._finishMethod;
  }

  get interaction(): IInteraction | undefined {
    return this._interaction;
  }

  get lastContinuedAt(): Date | undefined {
    return this._lastContinuedAt;
  }

  get accessTokens(): Map<string, IAccessToken> {
    return this._accessTokens;
  }
}

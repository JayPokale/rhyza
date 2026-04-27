import {
  InvalidInteractionError,
  NonInteractiveGrantError,
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
  IGrantEntity
} from './interfaces';

interface IGrantInput {
  id: string;
  tenantId: string;
  startMethods: IStartMethod[];
  identifier: string;
  continueToken: string;
  continueId: string;
  state: GrantState;
  interaction?: IInteraction;
  client?: string;
  subject?: ISubject;
  accesses?: IAccessItem[];
  finishMethod?: IFinishMethod;
  finishUri?: string;
  lastContinuedAt?: Date;
}

export class GrantEntity implements IGrantEntity {
  private _id: string;
  private _tenantId: string;
  private _startMethods: IStartMethod[];
  private _identifier: string;
  private _continueToken: string;
  private _continueId: string;
  private _state: GrantState;
  private _client?: string;
  private _subject?: ISubject;
  private _accesses?: IAccessItem[];
  private _finishMethod?: IFinishMethod;
  private _finishUri?: string;
  private _interaction?: IInteraction;
  private _lastContinuedAt?: Date;

  private constructor(input: IGrantInput) {
    this._id = input.id;
    this._tenantId = input.tenantId;
    this._startMethods = input.startMethods;
    this._identifier = input.identifier;
    this._continueToken = input.continueToken;
    this._continueId = input.continueId;
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

  toObject(): IGrant {
    return {
      id: this._id,
      tenantId: this._tenantId,
      interaction: this._interaction,
      startMethods: this._startMethods,
      identifier: this._identifier,
      continueToken: this._continueToken,
      continueId: this._continueId,
      state: this._state,
      client: this._client,
      subject: this._subject,
      accesses: this._accesses,
      finishMethod: this._finishMethod,
      finishUri: this._finishUri,
      lastContinuedAt: this._lastContinuedAt,
    };
  }

  addInteraction(interaction: IInteraction) {
    if (!this._startMethods) {
      throw new NonInteractiveGrantError();
    }

    this._interaction = interaction;
  }

  handleInteractionChoice(choice: InteractionChoice) {
    if (!this._interaction) {
      throw new UnknownInteractionError();
    }

    if (this._interaction.state !== InteractionState.PENDING)
      throw new InvalidInteractionError();

    this._interaction.state = choice;
  }

  finalizeGrant(state: GrantState) {
    this._state = state;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get startMethods(): IStartMethod[] {
    return this._startMethods;
  }

  get identifier(): string {
    return this._identifier;
  }

  get continueToken(): string {
    return this._continueToken;
  }

  get continueId(): string {
    return this._continueId;
  }

  get state(): GrantState {
    return this._state;
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
}

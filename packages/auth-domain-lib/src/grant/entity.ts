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
  IAccessToken,
  RevokedAccessToken,
  NewAccessToken
} from './interfaces';

interface IGrantInput {
  id: string;
  tenantId: string;
  startMethod: IStartMethod[];
  identifier: string;
  continueToken: string;
  continueId: string;
  state: GrantState;
  interaction?: IInteraction;
  client?: string;
  subject?: ISubject;
  access?: IAccessItem[];
  finishMethod?: IFinishMethod;
  finishUri?: string;
  lastContinuedAt?: Date;
  accessTokens: Map<string, IAccessToken>;
}

export class GrantEntity implements IGrant {
  private _id: string;
  private _tenantId: string;
  private _startMethod: IStartMethod[];
  private _identifier: string;
  private _continueToken: string;
  private _continueId: string;
  private _state: GrantState;
  private _client?: string;
  private _subject?: ISubject;
  private _access?: IAccessItem[];
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
    this._tenantId = input.tenantId;
    this._startMethod = input.startMethod;
    this._identifier = input.identifier;
    this._continueToken = input.continueToken;
    this._continueId = input.continueId;
    this._state = input.state;

    this._client = input.client;
    this._subject = input.subject;
    this._access = input.access;
    this._finishMethod = input.finishMethod;
    this._finishUri = input.finishUri;
    this._interaction = input.interaction;
    this._lastContinuedAt = input.lastContinuedAt;
  }

  static create(input: IGrantInput): GrantEntity {
    return new GrantEntity(input);
  }

  static fromObject(obj: IGrant): GrantEntity {
    return new GrantEntity(obj);
  }

  toObject(): IGrant {
    return {
      id: this._id,
      tenantId: this._tenantId,
      interaction: this._interaction,
      startMethod: this._startMethod,
      identifier: this._identifier,
      continueToken: this._continueToken,
      continueId: this._continueId,
      state: this._state,
      client: this._client,
      subject: this._subject,
      access: this._access,
      finishMethod: this._finishMethod,
      finishUri: this._finishUri,
      lastContinuedAt: this._lastContinuedAt,
      accessTokens: this._accessTokens
    };
  }

  addInteraction(interaction: IInteraction) {
    if (!this._startMethod) {
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

  issueAccessToken(accessToken: NewAccessToken) {
    this._accessTokens.set(accessToken.id, accessToken);
  }

  rotateAccessToken(
    oldAccessToken: RevokedAccessToken,
    newAccessToken: IAccessToken
  ) {
    this._accessTokens.set(oldAccessToken.id, oldAccessToken);
    this._accessTokens.set(newAccessToken.id, newAccessToken);
  }

  revokeAccessToken(accessToken: RevokedAccessToken) {
    this._accessTokens.set(accessToken.id, accessToken);
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get startMethod(): IStartMethod[] {
    return this._startMethod;
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

  get access(): IAccessItem[] | undefined {
    return this._access;
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

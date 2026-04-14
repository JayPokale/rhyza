import {
  InvalidInteractionError,
  NonInteractiveGrantError,
  UnknownInteractionError
} from './errors';
import {
  AccessItem,
  FinishMethod,
  GrantState,
  GrantIntent,
  Interaction,
  InteractionState,
  InteractionChoice,
  StartMethod,
  Subject,
  AccessToken,
  RevokedAccessToken,
  NewAccessToken
} from './interfaces';

interface IGrantNegotiationInput {
  id: string;
  tenantId: string;
  startMethod: StartMethod[];
  identifier: string;
  continueToken: string;
  continueId: string;
  state: GrantState;
  interaction?: Interaction;
  client?: string;
  subject?: Subject;
  access?: AccessItem[];
  finishMethod?: FinishMethod;
  finishUri?: string;
  lastContinuedAt?: Date;
  accessTokens: Map<string, AccessToken>;
}

export class GrantNegotiation implements GrantIntent {
  private _id: string;
  private _tenantId: string;
  private _startMethod: StartMethod[];
  private _identifier: string;
  private _continueToken: string;
  private _continueId: string;
  private _state: GrantState;
  private _client?: string;
  private _subject?: Subject;
  private _access?: AccessItem[];
  private _finishMethod?: FinishMethod;
  private _finishUri?: string;
  private _interaction?: Interaction;
  private _lastContinuedAt?: Date;
  private _accessTokens: Map<string, AccessToken> = new Map<
    string,
    AccessToken
  >();

  private constructor(input: IGrantNegotiationInput) {
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

  static create(input: IGrantNegotiationInput): GrantNegotiation {
    return new GrantNegotiation(input);
  }

  static fromObject(obj: GrantIntent): GrantIntent {
    return new GrantNegotiation(obj);
  }

  toObject(): GrantIntent {
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

  addInteraction(interaction: Interaction) {
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
    newAccessToken: AccessToken
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

  get startMethod(): StartMethod[] {
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

  get subject(): Subject | undefined {
    return this._subject;
  }

  get access(): AccessItem[] | undefined {
    return this._access;
  }

  get finishMethod(): FinishMethod | undefined {
    return this._finishMethod;
  }

  get interaction(): Interaction | undefined {
    return this._interaction;
  }

  get lastContinuedAt(): Date | undefined {
    return this._lastContinuedAt;
  }

  get accessTokens(): Map<string, AccessToken> {
    return this._accessTokens;
  }
}

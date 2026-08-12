import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { KeyObject, randomBytes, randomUUID } from 'node:crypto';
import { KeyLike } from 'crypto';
import { IMessage } from 'common-types-lib';
import {
  createHeaders,
  generateTestKeys
} from '@interledger/http-signature-utils';

import { GrantAggregate } from '../src/grant/aggregate';
import { GrantEntity } from '../src/grant/entity';
import {
  AcceptInteractionCmd,
  CreateGrantCmd,
  CreateGrantCmdPayload,
  IntrospectTokenCmd,
  IntrospectTokenCmdPayload,
  StartInteractionCmd,
  FinishInteractionCmd,
  RejectInteractionCmd
} from '../src/commands';
import {
  GrantCreatedEvent,
  GrantCreateFailedEvent,
  TokenIntrospectedEvent,
  GrantInteractionChoiceFailedEvent,
  GrantInteractionChoiceHandledEvent,
  GrantInteractionStartedEvent,
  GrantInteractionStartFailedEvent,
  GrantInteractionFinishedEvent,
  GrantInteractionFinishFailedEvent
} from '../src/grant/events';
import {
  AccessAction,
  AccessType,
  GrantState,
  IGrant,
  InteractionState
} from '../src/grant/interfaces';
import { MockGrantRepo, MockWalletAddressService } from './mocks';
import { PinoLogger } from 'implementations-lib';

const REQUEST_URL = 'https://auth.example/create';
const REQUEST_METHOD = 'POST';
const REQUEST_BODY = '{}';

// Signs the fixed request url/method/body with the given key, returning the
// resulting headers lower-cased the way they'd arrive on an incoming request.
async function signRequest(
  privateKey: KeyLike,
  keyId: string
): Promise<Record<string, string>> {
  const request = {
    url: REQUEST_URL,
    method: REQUEST_METHOD,
    body: REQUEST_BODY,
    headers: {} as Record<string, string>
  };
  const signatureHeaders = await createHeaders({ request, privateKey, keyId });
  const headers = { ...request.headers, ...signatureHeaders };
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
}

async function signedSignatureData(
  privateKey: KeyLike,
  kid: string
): Promise<CreateGrantCmdPayload['signatureData']> {
  return {
    url: REQUEST_URL,
    method: REQUEST_METHOD,
    body: REQUEST_BODY,
    headers: await signRequest(privateKey, kid),
    kid
  };
}

async function makeCreateGrantCmd(
  overrides: Partial<CreateGrantCmdPayload> = {},
  requestId: string = randomUUID()
): Promise<CreateGrantCmd> {
  const keys = generateTestKeys();

  return new CreateGrantCmd(
    {
      id: randomUUID(),
      client: JSON.stringify(keys.publicKey),
      signatureData: await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      ),
      access: [
        {
          type: AccessType.INCOMING_PAYMENT,
          actions: [AccessAction.CREATE, AccessAction.READ]
        }
      ],
      ...overrides
    },
    requestId
  );
}

function makeIntrospectTokenCmd(
  payload: Partial<IntrospectTokenCmdPayload> &
    Pick<IntrospectTokenCmdPayload, 'id' | 'tokenValue'>,
  requestId: string = randomUUID()
): IntrospectTokenCmd {
  return new IntrospectTokenCmd(payload, requestId);
}

function generateNonce(): string {
  return randomBytes(16).toString('hex').toUpperCase();
}

describe('GrantAggregate.handleBatch', () => {
  let repo: MockGrantRepo;
  let walletAddressService: MockWalletAddressService;
  let aggregate: GrantAggregate;
  let logger: PinoLogger;

  beforeEach(() => {
    repo = new MockGrantRepo();
    logger = new PinoLogger();
    walletAddressService = new MockWalletAddressService();
    aggregate = new GrantAggregate(repo, walletAddressService, logger);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe('handleBatch', async () => {
    it('logs an error when it processes an unknown command', async () => {
      const errorMock = mock.method(logger, 'error', () => {});

      const unknownCmd: IMessage = {
        msgDataFormat: 'JSON',
        msgType: 'COMMAND',
        msgId: randomUUID(),
        msgName: 'SomeUnknownCommand',
        msgTimestamp: Date.now(),
        msgTopic: 'auth-commands',
        msgKey: null,
        msgPartition: null,
        msgOffset: null,
        msgBatchId: null,
        payload: {}
      };

      await assert.doesNotReject(() => aggregate.handleBatch([unknownCmd]));

      assert.equal(errorMock.mock.callCount(), 1);
      assert.equal(
        errorMock.mock.calls[0].arguments[0],
        `Received unexpected command: ${unknownCmd.msgName}`
      );
    });

    describe('handleCreateGrantCommand', async () => {
      it('creates a non-interactive grant and issues an access token', async () => {
        const cmd = await makeCreateGrantCmd();
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantCreatedEvent.name);
        const payload = (events[0] as GrantCreatedEvent).payload;
        assert.equal(payload.id, cmd.payload.id);
        assert.ok(payload.accessTokenValue);
        assert.ok(payload.accessTokenManagementId);
        assert.equal(payload.accessTokenExpiresIn, 10_000);
        assert.ok(payload.continueId, undefined);
        assert.ok(payload.continueToken, undefined);
        assert.equal(payload.interactionNonce, undefined);
        assert.deepEqual(payload.access, cmd.payload.access);
      });

      it('creates an interactive grant pending continuation for OUTGOING_PAYMENT access', async () => {
        const cmd = await makeCreateGrantCmd({
          access: [
            {
              type: AccessType.OUTGOING_PAYMENT,
              actions: [AccessAction.CREATE]
            }
          ],
          interact: { start: ['REDIRECT'] }
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantCreatedEvent.name);
        const payload = (events[0] as GrantCreatedEvent).payload;
        assert.ok(payload.continueId);
        assert.ok(payload.continueToken);
        assert.ok(payload.interactionNonce);
        assert.equal(payload.accessTokenValue, undefined);
        assert.equal(payload.accessTokenValue, undefined);
        assert.equal(payload.accessTokenManagementId, undefined);
        assert.equal(payload.accessTokenExpiresIn, undefined);
      });

      describe('client key provided through directed identity', () => {
        it('creates the grant when the provided key successfully validates the signature', async () => {
          const cmd = await makeCreateGrantCmd();
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreatedEvent.name);
          const payload = (events[0] as GrantCreatedEvent).payload;
          assert.equal(payload.id, cmd.payload.id);
        });

        it('fails with UnauthorizedRequestError when the provided key does not validate the signature', async () => {
          const clientKeys = generateTestKeys();
          const signerKeys = generateTestKeys();
          const cmd = await makeCreateGrantCmd({
            client: JSON.stringify(clientKeys.publicKey),
            signatureData: await signedSignatureData(
              signerKeys.privateKey,
              clientKeys.publicKey.kid
            )
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreateFailedEvent.name);
          const payload = (events[0] as GrantCreateFailedEvent).payload;
          assert.equal(payload.errorName, 'UnauthorizedRequestError');
          assert.equal(payload.grantId, cmd.payload.id);
        });
      });

      describe('client key resolved via wallet address lookup', () => {
        it('resolves the client key and creates the grant', async () => {
          const keys = generateTestKeys();
          const walletAddress = 'https://wallet.example/alice';
          const kid = 'wallet-key';
          walletAddressService.setKeys(walletAddress, [
            { ...keys.publicKey, kid }
          ]);

          const cmd = await makeCreateGrantCmd({
            client: walletAddress,
            signatureData: await signedSignatureData(keys.privateKey, kid)
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreatedEvent.name);
          const payload = (events[0] as GrantCreatedEvent).payload;
          assert.equal(payload.id, cmd.payload.id);
        });

        it('fails with UnauthorizedRequestError when the wallet address has no matching key', async () => {
          const keys = generateTestKeys();
          const walletAddress = 'https://wallet.example/bob';
          walletAddressService.setKeys(walletAddress, [
            { ...keys.publicKey, kid: 'some-other-key' }
          ]);

          const cmd = await makeCreateGrantCmd({
            client: walletAddress,
            signatureData: await signedSignatureData(
              keys.privateKey,
              'wallet-key'
            )
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreateFailedEvent.name);
          const payload = (events[0] as GrantCreateFailedEvent).payload;
          assert.equal(payload.errorName, 'UnauthorizedRequestError');
          assert.equal(payload.grantId, cmd.payload.id);
        });

        it('fails with UnauthorizedRequestError when the wallet address has no keys at all', async () => {
          const keys = generateTestKeys();
          const cmd = await makeCreateGrantCmd({
            client: 'https://wallet.example/nokeys',
            signatureData: await signedSignatureData(
              keys.privateKey,
              'wallet-key'
            )
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreateFailedEvent.name);
          const payload = (events[0] as GrantCreateFailedEvent).payload;
          assert.equal(payload.errorName, 'UnauthorizedRequestError');
        });

        it('fails with UnauthorizedRequestError when the resolved key does not validate the signature', async () => {
          const signerKeys = generateTestKeys();
          const wrongKeys = generateTestKeys();
          const walletAddress = 'https://wallet.example/carol';
          const kid = 'wallet-key';
          walletAddressService.setKeys(walletAddress, [
            { ...wrongKeys.publicKey, kid }
          ]);

          const cmd = await makeCreateGrantCmd({
            client: walletAddress,
            signatureData: await signedSignatureData(signerKeys.privateKey, kid)
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantCreateFailedEvent.name);
          const payload = (events[0] as GrantCreateFailedEvent).payload;
          assert.equal(payload.errorName, 'UnauthorizedRequestError');
          assert.equal(payload.grantId, cmd.payload.id);
        });
      });

      it('fails with DuplicateGrantError when a grant with the same id already exists', async () => {
        const id = randomUUID();

        await aggregate.handleBatch([await makeCreateGrantCmd({ id })]);

        const { events } = await aggregate.handleBatch([
          await makeCreateGrantCmd({ id })
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantCreateFailedEvent.name);
        const payload = (events[0] as GrantCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'DuplicateGrantError');
        assert.equal(payload.grantId, id);
      });

      it('carries subjectIds through to the created grant event', async () => {
        const subjectIds = [{ format: 'email', id: 'alice@example.com' }];
        const cmd = await makeCreateGrantCmd({ subjectIds });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events[0].msgName, GrantCreatedEvent.name);
        const payload = (events[0] as GrantCreatedEvent).payload;
        assert.deepEqual(payload.subjectIds, subjectIds);
      });
    });

    describe('handleIntrospectTokenCommand', async () => {
      async function createAndFlushIssuedGrant(
        access: CreateGrantCmdPayload['access'] = [
          { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
        ]
      ): Promise<{ id: string; tokenValue: string }> {
        const keys = generateTestKeys();
        const createCmd = await makeCreateGrantCmd({
          client: JSON.stringify(keys.publicKey),
          signatureData: await signedSignatureData(
            keys.privateKey,
            keys.publicKey.kid
          ),
          access
        });
        const { events } = await aggregate.handleBatch([createCmd]);
        const payload = (events[0] as GrantCreatedEvent).payload;

        await aggregate.flush();

        return {
          id: createCmd.payload.id,
          tokenValue: payload.accessTokenValue as string
        };
      }

      it('returns active: true for a valid access token', async () => {
        const access = [
          { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
        ];
        const { id, tokenValue } = await createAndFlushIssuedGrant(access);

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({ id, tokenValue })
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.id, id);
        assert.equal(payload.active, true);
        assert.deepEqual(payload.access, access);
      });

      it('returns active: false for an access token value that does not match', async () => {
        const { id } = await createAndFlushIssuedGrant();

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({ id, tokenValue: 'unknown-token-value' })
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.active, false);
        assert.equal(payload.access, undefined);
      });

      it('restricts the returned access to the requested access items', async () => {
        const access = [
          { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] },
          { type: AccessType.QUOTE, actions: [AccessAction.CREATE] }
        ];
        const { id, tokenValue } = await createAndFlushIssuedGrant(access);

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({
            id,
            tokenValue,
            access: [access[0]]
          })
        ]);

        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.active, true);
        assert.deepEqual(payload.access, [access[0]]);
      });

      it('returns active: false when the requested access items are not fully covered by the grant', async () => {
        const access = [
          { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
        ];
        const { id, tokenValue } = await createAndFlushIssuedGrant(access);

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({
            id,
            tokenValue,
            access: [
              ...access,
              { type: AccessType.QUOTE, actions: [AccessAction.CREATE] }
            ]
          })
        ]);

        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.active, false);
      });

      it('returns active: false when the grant does not exist', async () => {
        const id = randomUUID();
        const debugMock = mock.method(logger, 'debug', () => {});

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({ id, tokenValue: 'some-token-value' })
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.id, id);
        assert.equal(payload.active, false);
        assert.equal(
          debugMock.mock.calls.some(
            (call) =>
              call.arguments[0] ===
              `Grant ${id} not found - command: IntrospectTokenCmd`
          ),
          true
        );
      });

      it('returns active: false and logs the error when introspection fails unexpectedly', async () => {
        const { id, tokenValue } = await createAndFlushIssuedGrant();
        const errorMock = mock.method(logger, 'error', () => {});
        mock.method(GrantEntity.prototype, 'introspectAccessToken', () => {
          throw new Error('unexpected failure');
        });

        const { events } = await aggregate.handleBatch([
          makeIntrospectTokenCmd({ id, tokenValue })
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, TokenIntrospectedEvent.name);
        const payload = (events[0] as TokenIntrospectedEvent).payload;
        assert.equal(payload.id, id);
        assert.equal(payload.active, false);
        assert.equal(errorMock.mock.callCount(), 1);
      });

      describe('handleStartInteractionCommand', async () => {
        async function createInteractiveGrant(): Promise<{
          id: string;
        }> {
          const keys = generateTestKeys();
          const cmd = await makeCreateGrantCmd({
            client: JSON.stringify(keys.publicKey),
            signatureData: await signedSignatureData(
              keys.privateKey,
              keys.publicKey.kid
            ),
            access: [
              {
                type: AccessType.OUTGOING_PAYMENT,
                actions: [AccessAction.CREATE]
              }
            ],
            interact: { start: ['REDIRECT'] }
          });
          const { events } = await aggregate.handleBatch([cmd]);
          const payload = (events[0] as GrantCreatedEvent).payload;
          return {
            id: payload.id
          };
        }

        it('starts the interaction and returns GrantInteractionStartedEvent when the nonce matches', async () => {
          const storeInteractionsMock = mock.method(repo, 'storeInteractions');

          const { id } = await createInteractiveGrant();
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new StartInteractionCmd({ id }, requestId)
          ]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantInteractionStartedEvent.name);
          const payload = (events[0] as GrantInteractionStartedEvent).payload;
          assert.equal(payload.id, id);
          assert.ok(payload.nonce);
          assert.equal(events[0].requestId, requestId);

          assert.equal(storeInteractionsMock.mock.callCount(), 0);

          await aggregate.flush();

          assert.equal(storeInteractionsMock.mock.callCount(), 1);
          const updates = storeInteractionsMock.mock.calls[0].arguments[0];
          assert.equal(updates.length, 1);
          assert.equal(updates[0].id, id);
          assert.ok(updates[0].interaction?.interactRef);
        });

        it('fails with GrantNotFoundError when the grant does not exist', async () => {
          const storeInteractionsMock = mock.method(repo, 'storeInteractions');
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new StartInteractionCmd({ id: randomUUID() }, requestId)
          ]);

          assert.equal(events.length, 1);
          assert.equal(
            events[0].msgName,
            GrantInteractionStartFailedEvent.name
          );
          const payload = (events[0] as GrantInteractionStartFailedEvent)
            .payload;
          assert.equal(payload.errorName, 'GrantNotFoundError');
          assert.equal(events[0].requestId, requestId);
          await aggregate.flush();

          assert.equal(storeInteractionsMock.mock.callCount(), 0);
        });
      });

      describe('handleFinishInteractionCommand', async () => {
        function makeGrantWithInteraction(
          interactionOverrides: Partial<{
            nonce: string;
            state: InteractionState;
          }> = {}
        ): IGrant {
          const createdAt = Date.now();
          return {
            id: randomUUID(),
            startMethods: ['REDIRECT'],
            state: GrantState.PROCESSING,
            interactionNonce: generateNonce(),
            finishNonce: generateNonce(),
            accessTokens: [],
            interaction: {
              interactRef: randomUUID(),
              nonce: 'correct-nonce',
              createdAt,
              expiresAt: createdAt + 10_000,
              state: InteractionState.APPROVED,
              ...interactionOverrides
            }
          };
        }

        it('returns GrantInteractionFinishedEvent when the interaction was approved', async () => {
          const grant = makeGrantWithInteraction();
          await repo.storeMany([grant]);
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new FinishInteractionCmd(
              { id: grant.id, nonce: grant.interactionNonce as string },
              requestId
            )
          ]);

          assert.equal(events.length, 1);
          assert.equal(events[0].msgName, GrantInteractionFinishedEvent.name);
          assert.equal(events[0].requestId, requestId);
          const payload = (events[0] as GrantInteractionFinishedEvent).payload;
          assert.equal(payload.id, grant.id);
          assert.equal(payload.interactNonce, grant.interactionNonce);
          assert.equal(payload.clientNonce, grant.finishNonce);
          assert.equal(payload.interactRef, grant.interaction?.interactRef);
        });

        it('fails with UnknownInteractionError when the nonce does not match', async () => {
          const grant = makeGrantWithInteraction();
          await repo.storeMany([grant]);
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new FinishInteractionCmd(
              { id: grant.id, nonce: 'wrong-nonce' },
              requestId
            )
          ]);

          assert.equal(events.length, 1);
          assert.equal(
            events[0].msgName,
            GrantInteractionFinishFailedEvent.name
          );
          assert.equal(events[0].requestId, requestId);
          const payload = (events[0] as GrantInteractionFinishFailedEvent)
            .payload;
          assert.equal(payload.grantId, grant.id);
          assert.equal(payload.errorName, 'UnknownInteractionError');
        });

        it('fails with InvalidInteractionError when the interaction is still pending', async () => {
          const grant = makeGrantWithInteraction({
            state: InteractionState.PENDING
          });
          await repo.storeMany([grant]);
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new FinishInteractionCmd(
              { id: grant.id, nonce: grant.interactionNonce as string },
              requestId
            )
          ]);

          assert.equal(events.length, 1);
          assert.equal(
            events[0].msgName,
            GrantInteractionFinishFailedEvent.name
          );
          const payload = (events[0] as GrantInteractionFinishFailedEvent)
            .payload;
          assert.equal(payload.grantId, grant.id);
          assert.equal(payload.errorName, 'InvalidInteractionError');
        });

        it('fails with GrantNotFoundError when the grant does not exist', async () => {
          const requestId = randomUUID();

          const { events } = await aggregate.handleBatch([
            new FinishInteractionCmd(
              { id: randomUUID(), nonce: 'any-nonce' },
              requestId
            )
          ]);

          assert.equal(events.length, 1);
          assert.equal(
            events[0].msgName,
            GrantInteractionFinishFailedEvent.name
          );
          assert.equal(events[0].requestId, requestId);
          const payload = (events[0] as GrantInteractionFinishFailedEvent)
            .payload;
          assert.equal(payload.errorName, 'GrantNotFoundError');
        });
      });
    });

    describe('handleInteractionChoice', async () => {
      async function createGrantWithStartedInteraction(): Promise<{
        id: string;
        nonce: string;
      }> {
        const cmd = await makeCreateGrantCmd({
          access: [
            {
              type: AccessType.OUTGOING_PAYMENT,
              actions: [AccessAction.CREATE]
            }
          ],
          interact: { start: ['REDIRECT'] }
        });
        const { events } = await aggregate.handleBatch([cmd]);
        const createdPayload = (events[0] as GrantCreatedEvent).payload;
        const id = createdPayload.id;
        const interactionNonce = createdPayload.interactionNonce as string;

        await aggregate.handleBatch([
          new StartInteractionCmd({ id }, randomUUID())
        ]);

        return { id, nonce: interactionNonce };
      }

      it('approves the interaction and returns GrantInteractionChoiceHandledEvent', async () => {
        const { id, nonce } = await createGrantWithStartedInteraction();
        const requestId = randomUUID();

        const { events } = await aggregate.handleBatch([
          new AcceptInteractionCmd({ id }, requestId)
        ]);

        assert.equal(events.length, 1);
        assert.equal(
          events[0].msgName,
          GrantInteractionChoiceHandledEvent.name
        );
        const payload = (events[0] as GrantInteractionChoiceHandledEvent)
          .payload;
        assert.equal(payload.id, id);
        assert.equal(events[0].requestId, requestId);
      });

      it('denies the interaction and returns GrantInteractionChoiceHandledEvent', async () => {
        const { id, nonce } = await createGrantWithStartedInteraction();
        const requestId = randomUUID();

        const { events } = await aggregate.handleBatch([
          new RejectInteractionCmd({ id }, requestId)
        ]);

        assert.equal(events.length, 1);
        assert.equal(
          events[0].msgName,
          GrantInteractionChoiceHandledEvent.name
        );
        const payload = (events[0] as GrantInteractionChoiceHandledEvent)
          .payload;
        assert.equal(payload.id, id);
        assert.equal(events[0].requestId, requestId);
      });

      it('fails with GrantNotFoundError when the grant does not exist', async () => {
        const requestId = randomUUID();

        const { events } = await aggregate.handleBatch([
          new AcceptInteractionCmd({ id: randomUUID() }, requestId)
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantInteractionChoiceFailedEvent.name);
        const payload = (events[0] as GrantInteractionChoiceFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'GrantNotFoundError');
        assert.equal(events[0].requestId, requestId);
      });

      it('fails with UnknownInteractionError when the interaction was never started', async () => {
        const cmd = await makeCreateGrantCmd({
          access: [
            {
              type: AccessType.OUTGOING_PAYMENT,
              actions: [AccessAction.CREATE]
            }
          ],
          interact: { start: ['REDIRECT'] }
        });
        const { events: createEvents } = await aggregate.handleBatch([cmd]);
        const id = (createEvents[0] as GrantCreatedEvent).payload.id;
        const nonce = (createEvents[0] as GrantCreatedEvent).payload
          .interactionNonce as string;
        const requestId = randomUUID();

        const { events } = await aggregate.handleBatch([
          new AcceptInteractionCmd({ id }, requestId)
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantInteractionChoiceFailedEvent.name);
        const payload = (events[0] as GrantInteractionChoiceFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'UnknownInteractionError');
        assert.equal(events[0].requestId, requestId);
      });

      it('fails with InvalidInteractionError when the interaction has expired', async () => {
        const id = randomUUID();
        const interactionNonce = 'nonce';
        await repo.storeMany([
          {
            id,
            interactionNonce,
            startMethods: ['REDIRECT'],
            state: 'PENDING',
            interaction: {
              interactRef: randomUUID(),
              state: 'PENDING',
              createdAt: Date.now() - 20_000,
              expiresAt: Date.now() - 10_000
            }
          } as IGrant
        ]);
        const requestId = randomUUID();

        const { events } = await aggregate.handleBatch([
          new AcceptInteractionCmd({ id }, requestId)
        ]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, GrantInteractionChoiceFailedEvent.name);
        const payload = (events[0] as GrantInteractionChoiceFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'InvalidInteractionError');
        assert.equal(events[0].requestId, requestId);
      });
    });
  });
});

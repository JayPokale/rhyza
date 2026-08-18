import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { GrantEntity } from '../src/grant/entity';
import {
  InvalidGrantError,
  NonInteractiveGrantError,
  InvalidInteractionError,
  UnknownInteractionError
} from '../src/grant/errors';
import {
  AccessAction,
  AccessType,
  GrantState,
  IFinishMethod,
  IGrant,
  InteractionState
} from '../src/grant/interfaces';

function makeCreateGrantInput(
  overrides: Partial<Parameters<typeof GrantEntity.create>[0]> = {}
) {
  return {
    id: randomUUID(),
    startMethods: [],
    client: 'https://wallet.example/alice',
    accesses: [
      { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
    ],
    ...overrides
  };
}

function makeInteractiveCreateInput(
  overrides: Partial<Parameters<typeof GrantEntity.create>[0]> = {}
) {
  return makeCreateGrantInput({
    startMethods: ['REDIRECT'],
    accesses: [
      { type: AccessType.OUTGOING_PAYMENT, actions: [AccessAction.CREATE] }
    ],
    ...overrides
  });
}

function makeContinuableGrant(overrides: Partial<IGrant> = {}): GrantEntity {
  const { entity } = GrantEntity.create(makeInteractiveCreateInput());
  const obj = entity.toObject();
  return GrantEntity.fromObject({
    ...obj,
    lastContinuedAt: new Date(0),
    ...overrides
  });
}

describe('GrantEntity', () => {
  describe('create', () => {
    it('finalizes the grant and issues an access token if the grant is non-interactive', () => {
      const id = randomUUID();
      const client = 'https://wallet.example/alice';
      const subjectIds = [{ format: 'email', id: 'alice@example.com' }];
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const finishUri = 'https://client.example/finish';
      const input = makeCreateGrantInput({
        id,
        client,
        subjectIds,
        accesses,
        finishUri
      });

      const { entity, accessToken } = GrantEntity.create(input);

      assert.equal(entity.state, 'ISSUED');
      assert.ok(entity.continueToken);
      assert.ok(entity.continueId);

      assert.equal(entity.interaction, undefined);

      assert.ok(accessToken);
      assert.ok(accessToken.value);
      assert.ok(accessToken.managementId);
      assert.equal(accessToken.expiresInMs, 10_000); // Default access token expiry
      assert.ok(accessToken.expiresAt instanceof Date);
      assert.equal(
        accessToken.expiresAt.getTime() - accessToken.createdAt.getTime(),
        10_000
      ); // Default access token expiry
      assert.ok(accessToken.createdAt instanceof Date);

      assert.equal(entity.accessTokens.length, 1);
      assert.equal(
        entity.accessTokens.find(
          (entityAccessToken) => entityAccessToken.value === accessToken.value
        ),
        accessToken
      );

      // Input fields are carried onto the created entity.
      assert.equal(entity.client, client);
      assert.deepEqual(entity.subjectIds, subjectIds);
      assert.deepEqual(entity.accesses, accesses);
      assert.deepEqual(entity.startMethods, []);
      const obj = entity.toObject();
      assert.equal(obj.id, id);
      assert.equal(obj.finishUri, finishUri);
    });

    it('leaves the grant in pending state without an access token and creates continuation information for interactive grants', () => {
      const id = randomUUID();
      const client = 'https://wallet.example/alice';
      const subjectIds = [{ format: 'email', id: 'alice@example.com' }];
      const accesses = [
        {
          type: AccessType.OUTGOING_PAYMENT,
          actions: [AccessAction.CREATE]
        }
      ];
      const finishUri = 'https://client.example/finish';
      const finishMethod = IFinishMethod.REDIRECT;
      const finishNonce = randomUUID();
      const input = makeCreateGrantInput({
        id,
        client,
        subjectIds,
        accesses,
        finishUri,
        finishMethod,
        finishNonce,
        startMethods: ['REDIRECT']
      });

      const { entity, accessToken } = GrantEntity.create(input);

      assert.equal(entity.state, 'PENDING');
      assert.ok(entity.continueToken);
      assert.ok(entity.continueId);
      assert.ok(entity.lastContinuedAt instanceof Date);
      assert.ok(entity.lastContinuedAt!.getTime() <= Date.now());

      assert.equal(entity.interaction, undefined); // This should not be initalized until startInteraction is called on the entity.

      assert.equal(accessToken, undefined);
      assert.equal(entity.accessTokens.length, 0);

      // Input fields are carried onto the created entity.
      assert.equal(entity.client, client);
      assert.deepEqual(entity.subjectIds, subjectIds);
      assert.deepEqual(entity.accesses, accesses);
      assert.deepEqual(entity.startMethods, ['REDIRECT']);
      const obj = entity.toObject();
      assert.equal(obj.id, id);
      assert.equal(obj.finishUri, finishUri);
      assert.equal(obj.finishMethod, finishMethod);
      assert.equal(obj.finishNonce, finishNonce);
    });

    it('treats the grant as continuable if any requested access is interactive', () => {
      const input = makeCreateGrantInput({
        startMethods: ['REDIRECT'],
        accesses: [
          { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] },
          {
            type: AccessType.OUTGOING_PAYMENT,
            actions: [AccessAction.CREATE]
          }
        ]
      });
      const { entity, accessToken } = GrantEntity.create(input);

      assert.equal(entity.state, 'PENDING');
      assert.ok(entity.continueToken);
      assert.ok(entity.continueId);
      assert.ok(entity.lastContinuedAt instanceof Date);
      assert.equal(entity.interaction, undefined); // This should not be initialized at this point.
      assert.equal(accessToken, undefined);
    });
  });

  describe('continue', () => {
    it('rejects an invalid continue token or continue id', () => {
      const entity = makeContinuableGrant();

      assert.throws(
        () => entity.continue('wrong-token', entity.continueId!),
        InvalidGrantError
      );
      assert.throws(
        () => entity.continue(entity.continueToken!, 'wrong-id'),
        InvalidGrantError
      );
    });

    it('rejects continuation within the poll window after lastContinuedAt', () => {
      const { entity } = GrantEntity.create(makeInteractiveCreateInput());

      assert.throws(
        () => entity.continue(entity.continueToken!, entity.continueId!),
        (err: Error) =>
          err instanceof InvalidGrantError &&
          err.message === 'Cannot continue grant too soon'
      );
    });

    it('rotates the continue token when the grant is pending and no interact ref is provided', () => {
      const entity = makeContinuableGrant();
      const prevToken = entity.continueToken!;
      const prevId = entity.continueId!;

      const accessToken = entity.continue(prevToken, prevId);

      assert.equal(accessToken, undefined);
      assert.equal(entity.state, GrantState.PENDING);
      assert.ok(entity.continueToken);
      assert.notEqual(entity.continueToken, prevToken);
      assert.notEqual(entity.continueId, prevId);
      assert.ok(entity.lastContinuedAt!.getTime() <= Date.now());
      assert.equal(entity.accessTokens.length, 0);
    });

    it('issues an access token and marks the grant issued when approved without an interact ref', () => {
      const entity = makeContinuableGrant({ state: GrantState.APPROVED });
      const token = entity.continueToken!;
      const id = entity.continueId!;

      const accessToken = entity.continue(token, id);

      assert.equal(entity.state, GrantState.ISSUED);
      assert.ok(accessToken);
      assert.ok(accessToken.value);
      assert.ok(accessToken.managementId);
      assert.equal(entity.accessTokens.length, 1);
      assert.equal(
        entity.accessTokens.find(
          (entityAccessToken) => entityAccessToken.value === accessToken.value
        ),
        accessToken
      );
    });

    it('rejects continuation without an interact ref when the grant is not pending or approved', () => {
      const entity = makeContinuableGrant({ state: GrantState.ISSUED });

      assert.throws(
        () => entity.continue(entity.continueToken!, entity.continueId!),
        (err: Error) =>
          err instanceof InvalidGrantError &&
          err.message === 'Grant is not in a state that can be continued'
      );
    });

    it('requires an interact ref when the grant has a finish method', () => {
      const { entity: created } = GrantEntity.create(
        makeInteractiveCreateInput({
          finishMethod: IFinishMethod.REDIRECT,
          finishUri: 'https://client.example/finish'
        })
      );
      const entity = GrantEntity.fromObject({
        ...created.toObject(),
        lastContinuedAt: new Date(0)
      });

      assert.throws(
        () => entity.continue(entity.continueToken!, entity.continueId!),
        (err: Error) =>
          err instanceof InvalidGrantError &&
          err.message === 'Grant requires an interaction reference to continue'
      );
    });

    it('issues an access token when continued with an approved interact ref', () => {
      const entity = makeContinuableGrant();
      const interaction = entity.startInteraction();
      entity.handleInteraction(InteractionState.APPROVED);

      const accessToken = entity.continue(
        entity.continueToken!,
        entity.continueId!,
        interaction.interactRef
      );

      assert.equal(entity.state, GrantState.ISSUED);
      assert.ok(accessToken);
      assert.equal(entity.accessTokens.length, 1);
      assert.equal(
        entity.accessTokens.find(
          (entityAccessToken) => entityAccessToken.value === accessToken.value
        ),
        accessToken
      );
    });

    it('finalizes the grant as rejected when continued with a rejected interact ref', () => {
      const entity = makeContinuableGrant();
      const interaction = entity.startInteraction();
      entity.handleInteraction(InteractionState.REJECTED);

      const accessToken = entity.continue(
        entity.continueToken!,
        entity.continueId!,
        interaction.interactRef
      );

      assert.equal(accessToken, undefined);
      assert.equal(entity.state, GrantState.REJECTED);
      assert.equal(entity.accessTokens.length, 0);
    });

    it('rejects an unknown or unmatched interact ref', () => {
      const entity = makeContinuableGrant();
      const token = entity.continueToken!;
      const id = entity.continueId!;

      assert.throws(
        () => entity.continue(token, id, 'missing-interact-ref'),
        InvalidInteractionError
      );

      const interaction = entity.startInteraction();
      assert.throws(
        () => entity.continue(token, id, interaction.interactRef),
        InvalidInteractionError
      );
    });
  });

  describe('startInteraction', () => {
    it('creates a pending interaction and moves the grant to pending state', () => {
      const entity = makeContinuableGrant();

      const { nonce, ...interaction } = entity.startInteraction();

      assert.ok(interaction.interactRef);
      assert.equal(nonce, entity.interactionNonce);
      assert.equal(typeof interaction.createdAt, 'number');
      assert.equal(interaction.expiresAt, interaction.createdAt + 600_000); // Default interaction expiry
      assert.equal(interaction.state, InteractionState.PENDING);

      assert.equal(entity.state, GrantState.PENDING);
      assert.deepEqual(entity.interaction, interaction);
    });

    it('throws NonInteractiveGrantError when the grant has no start methods', () => {
      const entity = GrantEntity.fromObject({
        id: randomUUID(),
        state: GrantState.PROCESSING
      } as IGrant);

      assert.throws(
        () => entity.startInteraction(),
        (err: Error) => {
          assert(err instanceof NonInteractiveGrantError);
          return true;
        }
      );
    });

    it('throws InvalidGrantError when the grant is already in final state', () => {
      const entity = GrantEntity.fromObject({
        id: randomUUID(),
        startMethods: ['REDIRECT'],
        interactionNonce: randomUUID(),
        state: GrantState.ISSUED
      } as IGrant);

      assert.throws(
        () => entity.startInteraction(),
        (err: Error) => {
          assert(err instanceof InvalidGrantError);
          return true;
        }
      );
    });

    it('throws InvalidGrantError when the grant is already approved', () => {
      const entity = GrantEntity.fromObject({
        id: randomUUID(),
        startMethods: ['REDIRECT'],
        interactionNonce: randomUUID(),
        state: GrantState.APPROVED
      } as IGrant);

      assert.throws(
        () => entity.startInteraction(),
        (err: Error) => {
          assert(err instanceof InvalidGrantError);
          return true;
        }
      );
    });
  });

  describe('introspectAccessToken', () => {
    function createIssuedGrant(accesses = makeCreateGrantInput().accesses) {
      const input = makeCreateGrantInput({ accesses });
      const { entity, accessToken } = GrantEntity.create(input);
      assert.ok(accessToken); // Non-interactive grants issue a token immediately.
      return { entity, accessToken };
    }

    it('returns active: false for a value that does not match any access token', () => {
      const { entity } = createIssuedGrant();

      const result = entity.introspectAccessToken('unknown-token-value');

      assert.deepEqual(result, { active: false });
    });

    it('returns active: false for a revoked access token', () => {
      const { entity, accessToken } = createIssuedGrant();
      entity.revokeAccessToken(accessToken.value, accessToken.managementId);

      const result = entity.introspectAccessToken(accessToken.value);

      assert.deepEqual(result, { active: false });
    });

    it('returns active: false for an expired access token', (context) => {
      const now = Date.now();
      context.mock.timers.enable({ apis: ['Date'], now });

      const { entity, accessToken } = createIssuedGrant();
      context.mock.timers.tick(accessToken.expiresInMs + 1);

      const result = entity.introspectAccessToken(accessToken.value);

      assert.deepEqual(result, { active: false });
    });

    it('returns active: true with the grant accesses when no requestedAccesses are given', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const result = entity.introspectAccessToken(accessToken.value);

      assert.deepEqual(result, { active: true, access: accesses });
    });

    it('returns active: true with the matching access items when the grant covers every requested access', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] },
        { type: AccessType.QUOTE, actions: [AccessAction.CREATE] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const result = entity.introspectAccessToken(accessToken.value, [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ]);

      assert.deepEqual(result, {
        active: true,
        access: [accesses[0]]
      });
    });

    it('returns active: true when the requested actions are a subset of the actions on a matching grant access item', () => {
      const accesses = [
        {
          type: AccessType.INCOMING_PAYMENT,
          actions: [AccessAction.READ, AccessAction.CREATE]
        }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const requestedAccesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const result = entity.introspectAccessToken(
        accessToken.value,
        requestedAccesses
      );

      assert.deepEqual(result, { active: true, access: [accesses[0]] });
    });

    it('returns active: false when a matching access item does not have sufficiently overlapping actions', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const requestedAccesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.CREATE] }
      ];
      const result = entity.introspectAccessToken(
        accessToken.value,
        requestedAccesses
      );

      assert.deepEqual(result, { active: false });
    });

    it('returns active: false when a matching access item only has a subset of the requested actions', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.CREATE] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const requestedAccesses = [
        {
          type: AccessType.INCOMING_PAYMENT,
          actions: [AccessAction.CREATE, AccessAction.READ]
        }
      ];
      const result = entity.introspectAccessToken(
        accessToken.value,
        requestedAccesses
      );

      assert.deepEqual(result, { active: false });
    });

    it('returns active: true when a read request matches a grant access item with read-all', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ_ALL] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const requestedAccesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const result = entity.introspectAccessToken(
        accessToken.value,
        requestedAccesses
      );

      assert.deepEqual(result, { active: true, access: [accesses[0]] });
    });

    it('returns active: true when a list request matches a grant access item with list-all', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.LIST_ALL] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const requestedAccesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.LIST] }
      ];
      const result = entity.introspectAccessToken(
        accessToken.value,
        requestedAccesses
      );

      assert.deepEqual(result, { active: true, access: [accesses[0]] });
    });

    it('returns active: false when the grant does not cover every requested access', () => {
      const accesses = [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] }
      ];
      const { entity, accessToken } = createIssuedGrant(accesses);

      const result = entity.introspectAccessToken(accessToken.value, [
        { type: AccessType.INCOMING_PAYMENT, actions: [AccessAction.READ] },
        { type: AccessType.OUTGOING_PAYMENT, actions: [AccessAction.CREATE] }
      ]);

      assert.deepEqual(result, { active: false });
    })
  describe('finishInteraction', () => {
    function makeGrant(overrides: Partial<IGrant> = {}): GrantEntity {
      return GrantEntity.fromObject({
        id: randomUUID(),
        state: GrantState.PROCESSING,
        startMethods: ['REDIRECT'],
        ...overrides
      } as IGrant);
    }

    it('transitions the grant to APPROVED when the interaction was approved', () => {
      const createdAt = Date.now();
      const entity = makeGrant({
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.APPROVED
        }
      });

      const result = entity.finishInteraction(entity.interactionNonce as string);

      assert.equal(entity.state, GrantState.APPROVED);
      assert.equal(result.id, entity.id);
      assert.equal(result.state, GrantState.APPROVED);
    });

    it('finalizes the grant as REJECTED when the interaction was rejected', () => {
      const nonce = 'correct-nonce';
      const createdAt = Date.now();
      const entity = makeGrant({
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.REJECTED
        }
      });

      const result = entity.finishInteraction(nonce);

      assert.equal(entity.state, GrantState.REJECTED);
      assert.equal(result.state, GrantState.REJECTED);
    });

    it('throws InvalidInteractionError when the interaction is still pending', () => {
      const nonce = 'correct-nonce';
      const createdAt = Date.now();
      const entity = makeGrant({
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.PENDING
        }
      });

      assert.throws(
        () => entity.finishInteraction(nonce),
        (err: Error) => {
          assert(err instanceof InvalidInteractionError);
          return true;
        }
      );
      assert.equal(entity.state, GrantState.PROCESSING);
    });

    it('throws UnknownInteractionError when there is no interaction on the grant', () => {
      const entity = makeGrant();

      assert.throws(
        () => entity.finishInteraction('any-nonce'),
        (err: Error) => {
          assert(err instanceof UnknownInteractionError);
          return true;
        }
      );
    });

    it('throws UnknownInteractionError when the provided nonce does not match', () => {
      const createdAt = Date.now();
      const entity = makeGrant({
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.APPROVED
        }
      });

      assert.throws(
        () => entity.finishInteraction('wrong-nonce'),
        (err: Error) => {
          assert(err instanceof UnknownInteractionError);
          return true;
        }
      );
      assert.equal(entity.state, GrantState.PROCESSING);
    });

    it('throws InvalidGrantError when the grant is already FINALIZED', () => {
      const createdAt = Date.now();
      const entity = makeGrant({
        state: GrantState.ISSUED,
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.APPROVED
        }
      });

      assert.throws(
        () => entity.finishInteraction('correct-nonce'),
        (err: Error) => {
          assert(err instanceof InvalidGrantError);
          return true;
        }
      );
    });

    it('throws InvalidGrantError when the grant is already APPROVED', () => {
      const createdAt = Date.now();
      const entity = makeGrant({
        state: GrantState.APPROVED,
        interaction: {
          interactRef: randomUUID(),
          createdAt,
          expiresAt: createdAt + 600_000,
          state: InteractionState.APPROVED
        }
      });

      assert.throws(
        () => entity.finishInteraction('correct-nonce'),
        (err: Error) => {
          assert(err instanceof InvalidGrantError);
          return true;
        }
      );
    });
  });
});
});
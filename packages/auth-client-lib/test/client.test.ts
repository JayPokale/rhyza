'use strict';

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createHeaders,
  generateTestKeys
} from '@interledger/http-signature-utils';
import { AuthClient } from '../src/client';
import {
  AccessItem,
  GrantRequestFinish,
  SubjectId
} from 'auth-public-types-lib';

describe('Auth Client', () => {
  const AUTH_GRPC_URL = process.env['AUTH_GRPC_URL'] || '0.0.0.0:50054';

  const REQUEST_URL = 'https://auth.example/create';
  const REQUEST_METHOD = 'POST';
  const REQUEST_BODY = '{}';

  async function signedSignatureData(
    privateKey: ReturnType<typeof generateTestKeys>['privateKey'],
    kid: string
  ) {
    const request = {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
      body: REQUEST_BODY,
      headers: {} as Record<string, string>
    };
    const signatureHeaders = await createHeaders({
      request,
      privateKey,
      keyId: kid
    });
    const headers: Record<string, string> = {
      ...request.headers,
      ...signatureHeaders
    };
    return {
      url: REQUEST_URL,
      method: REQUEST_METHOD,
      body: REQUEST_BODY,
      headers: Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
          key.toLowerCase(),
          value
        ])
      ) as Record<string, string>,
      kid
    };
  }

  function makeAccessItem(
    overrides: { type?: string; actions?: string[] } = {}
  ): AccessItem {
    const item = new AccessItem();
    item.setType(overrides.type ?? 'INCOMING_PAYMENT');
    item.setActionsList(overrides.actions ?? ['READ']);
    return item;
  }

  let authClient: AuthClient;

  before(async () => {
    authClient = new AuthClient(AUTH_GRPC_URL);
    await authClient.init();
  });

  after(async () => {
    await authClient.disconnect();
  });

  describe('createGrant', () => {
    test('create non-interactive grant', async () => {
      const keys = generateTestKeys();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const subjectId = new SubjectId();
      subjectId.setFormat('email');
      subjectId.setId('alice@example.com');

      const access = makeAccessItem({
        type: 'INCOMING_PAYMENT',
        actions: ['CREATE']
      });
      const result = await authClient.createGrant(
        JSON.stringify(keys.publicKey),
        signatureData,
        {
          access: [access],
          subjectIds: [subjectId]
        }
      );

      assert.ok(result);
      assert.ok(result.getAccessTokenValue());
      assert.ok(result.getAccessTokenManagementId());
      assert.ok(result.getAccessTokenExpiresIn());
      assert.ok(result.getContinueId());
      assert.ok(result.getContinueToken());
      assert.equal(result.getInteractionNonce(), '');
      assert.deepStrictEqual(
        result.getAccessList().map((a) => a.toObject()),
        [access].map((a) => a.toObject())
      );
      assert.deepStrictEqual(
        result.getSubIdsList().map((s) => s.toObject()),
        [subjectId].map((s) => s.toObject())
      );
    });

    test('create interactive grant', async () => {
      const keys = generateTestKeys();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const finish = new GrantRequestFinish();
      finish.setFinish('REDIRECT');
      finish.setUri('https://client.example/finish');
      finish.setNonce('finish-nonce');

      const access = [
        makeAccessItem({ type: 'OUTGOING_PAYMENT', actions: ['CREATE'] })
      ];

      const result = await authClient.createGrant(
        JSON.stringify(keys.publicKey),
        signatureData,
        {
          access,
          finish
        }
      );

      assert.ok(result);
      assert.ok(result.getContinueId());
      assert.ok(result.getContinueToken());
      assert.ok(result.getInteractionNonce());
      assert.equal(result.getAccessTokenValue(), '');
      assert.equal(result.getAccessTokenManagementId(), '');
      assert.equal(result.getAccessTokenExpiresIn(), 0);
      assert.deepStrictEqual(
        result.getAccessList().map((a) => a.toObject()),
        access.map((a) => a.toObject())
      );
    });

    test('invalid signature is rejected', async () => {
      const clientKeys = generateTestKeys();
      const signerKeys = generateTestKeys(); // a different, unrelated key
      const signatureData = await signedSignatureData(
        signerKeys.privateKey,
        clientKeys.publicKey.kid
      );

      try {
        await authClient.createGrant(
          JSON.stringify(clientKeys.publicKey),
          signatureData,
          {
            access: [
              makeAccessItem({ type: 'INCOMING_PAYMENT', actions: ['CREATE'] })
            ]
          }
        );
        assert.fail('expected error for invalid signature');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });
  });

  describe('rotateToken', () => {
    async function createIssuedGrant() {
      const keys = generateTestKeys();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );
      const access = makeAccessItem({
        type: 'INCOMING_PAYMENT',
        actions: ['READ']
      });
      const result = await authClient.createGrant(
        JSON.stringify(keys.publicKey),
        signatureData,
        { access: [access] }
      );
      return {
        keys,
        grantId: result.getId(),
        tokenValue: result.getAccessTokenValue(),
        managementId: result.getAccessTokenManagementId()
      };
    }

    test('rotates a valid token and returns a new value and managementId', async () => {
      const { keys, grantId, tokenValue, managementId } =
        await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const result = await authClient.rotateToken(
        grantId,
        signatureData,
        tokenValue,
        managementId
      );

      assert.ok(result);
      assert.ok(result.getNewAccessTokenValue());
      assert.ok(result.getNewAccessTokenManagementId());
      assert.notEqual(result.getNewAccessTokenValue(), tokenValue);
      assert.notEqual(result.getNewAccessTokenManagementId(), managementId);
      assert.ok(result.getNewAccessTokenExpiresIn() > 0);
    });

    test('rejects rotation with an invalid signature', async () => {
      const { grantId, tokenValue, managementId } = await createIssuedGrant();
      const wrongKeys = generateTestKeys();
      const signatureData = await signedSignatureData(
        wrongKeys.privateKey,
        wrongKeys.publicKey.kid
      );

      try {
        await authClient.rotateToken(
          grantId,
          signatureData,
          tokenValue,
          managementId
        );
        assert.fail('expected error for invalid signature');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });

    test('rejects rotation of an unknown token value', async () => {
      const { keys, grantId, managementId } = await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      try {
        await authClient.rotateToken(
          grantId,
          signatureData,
          'unknown-token-value',
          managementId
        );
        assert.fail('expected error for unknown token');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });

    test('rejects replaying an already-rotated (revoked) token', async () => {
      const { keys, grantId, tokenValue, managementId } =
        await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      // First rotation succeeds.
      await authClient.rotateToken(
        grantId,
        signatureData,
        tokenValue,
        managementId
      );

      // Replaying the old token must fail.
      try {
        await authClient.rotateToken(
          grantId,
          await signedSignatureData(keys.privateKey, keys.publicKey.kid),
          tokenValue,
          managementId
        );
        assert.fail('expected error replaying revoked token');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });
  });

  describe('continueGrant', () => {
    async function createInteractiveGrant(
      keys: ReturnType<typeof generateTestKeys>,
      options: { withFinish?: boolean } = {}
    ) {
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const createOptions: {
        access: AccessItem[];
        finish?: GrantRequestFinish;
      } = {
        access: [
          makeAccessItem({ type: 'OUTGOING_PAYMENT', actions: ['CREATE'] })
        ]
      };

      if (options.withFinish) {
        const finish = new GrantRequestFinish();
        finish.setFinish('REDIRECT');
        finish.setUri('https://client.example/finish');
        finish.setNonce('finish-nonce');
        createOptions.finish = finish;
      }

      return authClient.createGrant(
        JSON.stringify(keys.publicKey),
        signatureData,
        createOptions
      );
    }

    test('continues pending grant and rotates continue token', async () => {
      const keys = generateTestKeys();
      const created = await createInteractiveGrant(keys);

      assert.ok(created.getId());
      assert.ok(created.getContinueId());
      assert.ok(created.getContinueToken());

      // Continue tokens are inactive until the grant poll window elapses.
      await new Promise((resolve) => setTimeout(resolve, 5_100));

      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const result = await authClient.continueGrant(
        created.getId(),
        signatureData,
        created.getContinueId(),
        created.getContinueToken()
      );

      assert.ok(result);
      assert.equal(result.getId(), created.getId());
      assert.equal(result.getState(), 'PENDING');
      assert.ok(result.getContinueId());
      assert.ok(result.getContinueToken());
      assert.notEqual(result.getContinueToken(), created.getContinueToken());
      assert.notEqual(result.getContinueId(), created.getContinueId());
      assert.equal(result.getAccessTokenValue(), '');
      assert.equal(result.getAccessTokenManagementId(), '');
      assert.equal(result.getAccessTokenExpiresIn(), 0);
    });

    test('rejects continue with invalid continue token', async () => {
      const keys = generateTestKeys();
      const created = await createInteractiveGrant(keys);
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      try {
        await authClient.continueGrant(
          created.getId(),
          signatureData,
          created.getContinueId(),
          'invalid-continue-token'
        );
        assert.fail('expected error for invalid continue token');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });

    test('rejects continue with invalid signature', async () => {
      const clientKeys = generateTestKeys();
      const created = await createInteractiveGrant(clientKeys);

      const signerKeys = generateTestKeys();
      const signatureData = await signedSignatureData(
        signerKeys.privateKey,
        clientKeys.publicKey.kid
      );

      try {
        await authClient.continueGrant(
          created.getId(),
          signatureData,
          created.getContinueId(),
          created.getContinueToken()
        );
        assert.fail('expected error for invalid signature');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });
  });

  describe('getGrant', () => {
    test('returns the grant for an existing id', async () => {
      const keys = generateTestKeys();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const access = makeAccessItem({
        type: 'INCOMING_PAYMENT',
        actions: ['READ']
      });
      const createResult = await authClient.createGrant(
        JSON.stringify(keys.publicKey),
        signatureData,
        { access: [access] }
      );

      const result = await authClient.getGrant(createResult.id);

      assert.ok(result);
      assert.equal(result.id, createResult.id);
      assert.equal(result.state, 'APPROVED');
      assert.equal(result.client, JSON.stringify(keys.publicKey));
      assert.equal(result.accesses.length, 1);
    });

    test('rejects with NOT_FOUND for an id that does not exist', async () => {
      try {
        await authClient.getGrant(crypto.randomUUID());
        assert.fail('expected error for an unknown grant id');
      } catch (e) {
        assert.ok(e instanceof Error);
      }
    });
  });
});

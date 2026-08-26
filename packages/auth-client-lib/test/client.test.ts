'use strict';

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  createHeaders,
  generateTestKeys
} from '@interledger/http-signature-utils';
import {
  AuthClient,
  AccessItem,
  GrantFinish,
  SubjectId,
  AccessLimits
} from '../src/';

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
    overrides: {
      type?: string;
      actions?: string[];
      limits?: AccessLimits;
      identifier?: string;
    } = {}
  ): AccessItem {
    return {
      type: 'INCOMING_PAYMENT',
      actions: ['READ'],
      ...overrides
    };
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

      const subjectId: SubjectId = {
        format: 'uri',
        id: 'https://wallet.com/alice'
      };

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
      assert.ok(result.accessTokenValue);
      assert.ok(result.accessTokenManagementId);
      assert.ok(result.accessTokenExpiresIn);
      assert.ok(result.continueId);
      assert.ok(result.continueToken);
      assert.equal(result.interactionNonce, undefined);
      assert.deepStrictEqual(result.access, [access]);
      assert.deepStrictEqual(result.subjectIds, [subjectId]);
    });

    test('create interactive grant', async () => {
      const keys = generateTestKeys();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const finish: GrantFinish = {
        method: 'REDIRECT',
        uri: 'https://client.example/finish',
        nonce: 'finish-nonce'
      };

      const access = [
        makeAccessItem({
          type: 'OUTGOING_PAYMENT',
          actions: ['CREATE'],
          limits: {
            debitAmount: {
              assetCode: 'USD',
              assetScale: 2,
              value: '100'
            }
          },
          identifier: 'https://wallet.com/alice'
        })
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
      assert.ok(result.continueId);
      assert.ok(result.continueToken);
      assert.ok(result.interactionNonce);
      assert.equal(result.accessTokenValue, undefined);
      assert.equal(result.accessTokenManagementId, undefined);
      assert.equal(result.accessTokenExpiresIn, undefined);
      assert.deepStrictEqual(result.access, access);
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

  describe('revokeToken', () => {
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
        grantId: result.id,
        tokenValue: result.accessTokenValue!,
        managementId: result.accessTokenManagementId!
      };
    }

    test('revokes a valid token', async () => {
      const { keys, grantId, tokenValue, managementId } =
        await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const result = await authClient.revokeToken(
        grantId,
        signatureData,
        tokenValue,
        managementId
      );

      assert.ok(result);
      assert.equal(result.id, grantId);
    });

    test('rejects revocation with an invalid signature', async () => {
      const { grantId, tokenValue, managementId } = await createIssuedGrant();
      const wrongKeys = generateTestKeys();
      const signatureData = await signedSignatureData(
        wrongKeys.privateKey,
        wrongKeys.publicKey.kid
      );

      try {
        await authClient.revokeToken(
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

    test('rejects revocation of an unknown token value', async () => {
      const { keys, grantId, managementId } = await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      try {
        await authClient.revokeToken(
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

    test('rejects revocation with a mismatched managementId', async () => {
      const { keys, grantId, tokenValue } = await createIssuedGrant();
      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      try {
        await authClient.revokeToken(
          grantId,
          signatureData,
          tokenValue,
          'wrong-management-id'
        );
        assert.fail('expected error for mismatched managementId');
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
        finish?: GrantFinish;
      } = {
        access: [
          makeAccessItem({ type: 'OUTGOING_PAYMENT', actions: ['CREATE'] })
        ]
      };

      if (options.withFinish) {
        createOptions.finish = {
          uri: 'https://client.example/finish',
          nonce: 'finish-nonce',
          method: 'redirect'
        };
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

      assert.ok(created.id);
      assert.ok(created.continueId);
      assert.ok(created.continueToken);

      // Continue tokens are inactive until the grant poll window elapses.
      await new Promise((resolve) => setTimeout(resolve, 5_100));

      const signatureData = await signedSignatureData(
        keys.privateKey,
        keys.publicKey.kid
      );

      const result = await authClient.continueGrant(
        created.id,
        signatureData,
        created.continueId,
        created.continueToken
      );

      assert.ok(result);
      assert.equal(result.id, created.id);
      assert.ok(result.continueId);
      assert.ok(result.continueToken);
      assert.notEqual(result.continueToken, created.continueToken);
      assert.notEqual(result.continueId, created.continueId);
      assert.equal(result.accessTokenValue, undefined);
      assert.equal(result.accessTokenManagementId, undefined);
      assert.equal(result.accessTokenManagementId, undefined);
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
          created.id,
          signatureData,
          created.continueId,
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
          created.id,
          signatureData,
          created.continueId,
          created.continueToken
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

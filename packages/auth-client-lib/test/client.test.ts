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
  const AUTH_GRPC_URL = process.env['AUTH_GRPC_URL'] || '0.0.0.0:50053';

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
      assert.ok(result.getAccessTokenManagementId);
      assert.ok(result.getAccessTokenExpiresIn());
      assert.equal(result.getContinueId(), undefined);
      assert.equal(result.getContinueToken(), undefined);
      assert.equal(result.getInteractionNonce(), undefined);
      assert.equal(result.getAccessList, [access]);
      assert.equal(result.getSubIdsList, [subjectId]);
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
      assert.equal(result.getAccessTokenValue(), undefined);
      assert.equal(result.getAccessTokenManagementId, undefined);
      assert.equal(result.getAccessTokenExpiresIn, undefined);
      assert.equal(result.getAccessList, access);
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
      assert.equal(result.getAccessTokenValue(), undefined);
      assert.equal(result.getAccessTokenManagementId(), undefined);
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
});

'use strict';

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as grpc from '@grpc/grpc-js';
import { ServiceError } from '@grpc/grpc-js';
import {
  createHeaders,
  generateTestKeys
} from '@interledger/http-signature-utils';
import { AuthClient, AccessItem, GrantFinish, SubjectId } from '../src/';

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
    return {
      type: overrides.type ?? 'INCOMING_PAYMENT',
      actions: overrides.actions ?? ['READ']
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
      assert.ok(result.interactionNonce);
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
      assert.ok(result.continueId);
      assert.ok(result.continueToken);
      assert.ok(result.interactionNonce);
      assert.equal(result.accessTokenValue, '');
      assert.equal(result.accessTokenManagementId, '');
      assert.equal(result.accessTokenExpiresIn, 0);
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
        await authClient.getGrant(randomUUID());
        assert.fail('expected error for an unknown grant id');
      } catch (e) {
        assert.ok(e instanceof Error);
        assert.equal((e as ServiceError).code, grpc.status.NOT_FOUND);
      }
    });
  });
});

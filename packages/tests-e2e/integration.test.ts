import assert from 'assert';
import { test, describe, before, after } from 'node:test';
import path from 'path';
import {
  DockerComposeEnvironment,
  StartedDockerComposeEnvironment
} from 'testcontainers';

const COMPOSE_DIR = path.resolve(__dirname, '../../docker');
const COMPOSE_FILES = ['docker-compose.yaml', 'docker-compose.test.yaml'];
const PROJECT_NAME = 'rafiki-v2-test';
const ADMIN_API_URL = 'http://localhost:5001';

describe('E2E tests', async () => {
  let environment: StartedDockerComposeEnvironment;

  before(async () => {
    // rafiki-v2-workspace must already exist (built by `pnpm e2e` / `pnpm docker:build:workspace`).
    environment = await new DockerComposeEnvironment(COMPOSE_DIR, COMPOSE_FILES)
      .withProjectName(PROJECT_NAME)
      .withBuild()
      .up();
    console.log('E2E tests environment started');
  });

  test('Local', async () => {
    const assetCode = 'USD';
    const createAssetResponse = await fetch(`${ADMIN_API_URL}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: assetCode,
        scale: 2
      })
    });
    console.log('** create asset response: ', createAssetResponse);
    assert.ok(createAssetResponse.ok);
    const assetResponseBody = await createAssetResponse.json();
    assert.ok(assetResponseBody.code === assetCode);
    console.log('Asset created successfully');

    // Continue flow
  });

  // test('Remote', async () => {});

  after(async () => {
    await environment?.down();
    console.log('E2E tests environment down');
  });
});

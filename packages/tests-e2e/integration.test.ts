import assert from 'assert';
import { test, describe, before, after } from 'node:test';
import path from 'path';
import {
  DockerComposeEnvironment,
  StartedDockerComposeEnvironment
} from 'testcontainers';
import { createAdminClient } from 'admin-client-lib';
import { AdminApiClient } from 'admin-client-lib/dist/adminApiClient';

const ADMIN_API_URL = 'http://localhost:3001';
const COMPOSE_FILE = 'docker-compose.yaml';

describe('E2E tests', () => {
  let environment: StartedDockerComposeEnvironment;
  let client: AdminApiClient;
  before(async () => {
    const composeDir = path.resolve(__dirname, '../../docker');
    environment = await new DockerComposeEnvironment(
      composeDir,
      COMPOSE_FILE
    ).up();

    client = createAdminClient(ADMIN_API_URL);
  });

  test('Local', async () => {
    const assetCode = 'USD';
    const asset = await client.assets.post({
      code: assetCode,
      scale: 2
    });
    assert.equal(asset?.code, assetCode);

    const senderAddress = 'test.com/sender';
    await createWalletAddress(assetCode, senderAddress, 'test sender');

    const receiverAddress = 'test.com/receiver';
    await createWalletAddress(assetCode, receiverAddress, 'test receiver');

    const paymentIntent = await client.paymentIntents.post({
      walletAddress: receiverAddress,
      incomingAmount: 100
    });

    assert.ok(paymentIntent?.id);
    const paymentIntentId = paymentIntent.id;

    const quote = await client.quotes.post({
      paymentIntentId,
      walletAddress: senderAddress
    });

    assert.ok(quote?.id);
    const quoteId = quote.id;

    const payment = await client.payments.post({
      quoteId,
      walletAddress: senderAddress,
      paymentIntentId
    });

    assert.ok(payment?.id);
    // const paymentId = payment.id;

    // const approvedPayment = await client.payments.byId(paymentId).approve.post({
    //   intentId: paymentIntentId
    // });

    // assert.equal(approvedPayment?.id, paymentId);
  });

  const createWalletAddress = async (
    assetCode: string,
    address: string,
    publicName: string
  ) => {
    const walletAddress = await client.walletAddresses.post({
      assetCode,
      address,
      publicName
    });
    assert.equal(walletAddress?.address, address);
  };

  // test('Remote', async () => {});

  after(async () => {
    await environment?.down();
  });
});

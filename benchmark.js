/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */

import http from 'k6/http';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { sleep } from 'k6';

export const options = {
  scenarios: {
    contacts: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '60s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '60s', target: 100 }
      ]
      // gracefulRampDown: "30s",
    }
  }
};

const ADMIN_API_URL = 'http://localhost';

function request(url, data, tag) {
  return http.post(url, JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json'
    },
    tags: { name: tag || 'none' }
  });
}

export function setup() {
  const assetRes = request(`${ADMIN_API_URL}/assets`, {
    code: 'USD',
    scale: 2
  });
  // 409 already exists OK for reruns
  check(assetRes, {
    'asset created or exists': (r) => r.status === 201 || r.status === 409
  });

  const receiverRes = request(`${ADMIN_API_URL}/wallet-addresses`, {
    address: 'test.com/receiver',
    publicName: 'Receiver',
    assetCode: 'USD'
  });
  check(receiverRes, {
    'receiver wallet created or exists': (r) =>
      r.status === 201 || r.status === 409
  });
  const receiver = JSON.parse(receiverRes.body);

  const senderRes = request(`${ADMIN_API_URL}/wallet-addresses`, {
    address: 'test.com/sender',
    publicName: 'Sender',
    assetCode: 'USD'
  });
  check(senderRes, {
    'sender wallet created or exists': (r) =>
      r.status === 201 || r.status === 409
  });
  const sender = JSON.parse(senderRes.body);

  const incomingPaymentId = uuidv4();
  const incomingPaymentRes = request(`${ADMIN_API_URL}/incoming-payments`, {
    id: incomingPaymentId,
    walletAddress: receiver.address || 'test.com/receiver'
  });

  check(incomingPaymentRes, {
    'incoming payment created': (r) => r.status === 201,
    'incoming payment id matches': (r) =>
      JSON.parse(r.body).id === incomingPaymentId
  });

  return {
    incomingPaymentId,
    receiverWalletAddress: receiver.address || 'test.com/receiver',
    senderWalletAddress: sender.address || 'test.com/sender'
  };
}

export default function (data) {
  const outgoingPaymentRes = request(
    `${ADMIN_API_URL}/outgoing-payments`,
    {
      incomingPaymentId: data.incomingPaymentId,
      walletAddress: data.senderWalletAddress,
      debitAmount: 10
    },
    'createOutgoingPayment'
  );
  check(outgoingPaymentRes, {
    'outgoing payment created': (r) => r.status === 201
  });

  const outgoingPaymentId = JSON.parse(outgoingPaymentRes.body).id;

  const approveOutgoingPaymentRes = request(
    `${ADMIN_API_URL}/outgoing-payments/${outgoingPaymentId}/approve`,
    {
      incomingPaymentId: data.incomingPaymentId,
      walletAddress: data.senderWalletAddress,
      debitAmount: 10
    },
    'approveOutgoingPayment'
  );
  check(approveOutgoingPaymentRes, {
    'outgoing payment approved': (r) => r.status === 200
  });
}

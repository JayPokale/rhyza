import http from "k6/http";
import { check } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  vus: 10,
  duration: "30s",
  // iterations: 1,
};

const RECEIVER_WALLET_ADDRESS_ID = "a1469618-077a-447d-b5a3-a9ed11265a63";
const SENDER_WALLET_ADDRESS_ID = "a1469618-077a-447d-b5a3-a9ed11265a64";

const BASE_URL = "http://localhost";

function request(url, data) {
  return http.post(url, JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}

export default function (data) {
  const id = uuidv4();
  const incomingPaymentRes = request(`${BASE_URL}/incoming-payment`, {
    id,
    walletAddressId: RECEIVER_WALLET_ADDRESS_ID,
  });

  check(incomingPaymentRes, {
    "incoming payment created": (r) => r.status === 200,
  });

  const outgoingPaymentRes = request(`${BASE_URL}/outgoing-payment`, {
    id: id,
    incomingPaymentId: id,
    debitAmount: {
      assetScale: 2,
      assetCode: "USD",
      value: 100,
    },
    senderWalletAddressId: SENDER_WALLET_ADDRESS_ID,
  });
  check(outgoingPaymentRes, {
    "outgoing payment created": (r) => r.status === 200,
  });
}

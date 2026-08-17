import { AccessItem } from 'auth-client-lib';
import { OpenPaymentsAuthServerRouteError } from './errors';
import { components } from './types/generated/auth-server-types';

const DELIMITER = '_';

function encodeCompoundId(grantId: string, otherId: string): string {
  return `${grantId}${DELIMITER}${otherId}`;
}

export function decodeCompoundId(value: string): {
  grantId: string;
  otherId: string;
} {
  const [grantId, otherId] = value.split(DELIMITER);
  if (!grantId || !otherId) {
    throw new OpenPaymentsAuthServerRouteError(
      404,
      `Malformed continuation id: ${value}`,
      'invalid_request'
    );
  }
  return { grantId, otherId };
}

export function createAccessTokenResponse(
  grantId: string,
  accessTokenValue: string,
  accessTokenManagementId: string,
  accessTokenExpiresIn: number,
  access: AccessItem[],
  openPaymentsAuthServerUrl: string
): components['schemas']['access_token'] {
  return {
    value: accessTokenValue,
    manage: `${openPaymentsAuthServerUrl}/token/${encodeCompoundId(grantId, accessTokenManagementId)}`,
    expires_in: accessTokenExpiresIn,
    access: access as components['schemas']['access']
  };
}

export function createContinueResponse(
  grantId: string,
  continueId: string,
  continueTokenValue: string,
  openPaymentsAuthServerUrl: string
): components['schemas']['continue'] {
  return {
    access_token: {
      value: continueTokenValue
    },
    uri: `${openPaymentsAuthServerUrl}/continue/${encodeCompoundId(grantId, continueId)}`
    // TODO wait
  };
}

export function createInteractResponse(
  grantId: string,
  interactionNonce: string,
  openPaymentsAuthServerUrl: string
): components['schemas']['interact-response'] {
  return {
    redirect: `${openPaymentsAuthServerUrl}/interact/${grantId}/${interactionNonce}`,
    finish: interactionNonce
  };
}

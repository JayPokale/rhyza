import { AccessItem } from 'auth-client-lib';
import { OpenPaymentsAuthServerRouteError } from './errors';
import { components } from './types/generated/auth-server-types';

const DELIMITER = '_';

function encodeCompoundId(grantId: string, otherId: string): string {
  return Buffer.from(`${grantId}${DELIMITER}${otherId}`).toString('base64url');
}

export function decodeCompoundId(value: string): {
  grantId: string;
  otherId: string;
} {
  const [grantId, otherId] = Buffer.from(value, 'base64url')
    .toString('utf-8')
    .split(DELIMITER);
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
  accessTokenManagementId: string,
  accessTokenValue: string,
  accessTokenExpiresIn: number,
  access: AccessItem[],
  openPaymentsAuthServerUrl: string
): components['schemas']['access_token'] {
  return {
    value: encodeCompoundId(grantId, accessTokenValue),
    manage: `${openPaymentsAuthServerUrl}/token/${encodeCompoundId(grantId, accessTokenManagementId)}`,
    expires_in: accessTokenExpiresIn,
    access: access.map((a) => ({
      actions: a.actions.map((action) =>
        action.toLowerCase().replace('_', '-')
      ),
      type: a.type.toLowerCase().replace('_', '-')
    })) as components['schemas']['access']
  };
}

export function createContinueResponse(
  grantId: string,
  continueTokenValue: string,
  openPaymentsAuthServerUrl: string
): components['schemas']['continue'] {
  return {
    access_token: {
      value: continueTokenValue
    },
    uri: `${openPaymentsAuthServerUrl}/continue/${grantId}`
    // TODO wait
  };
}

export function createInteractResponse(
  grantId: string,
  interactionNonce: string,
  openPaymentsAuthServerUrl: string
): components['schemas']['interact-response'] {
  return {
    redirect: `${openPaymentsAuthServerUrl}/interact/${grantId}`,
    finish: interactionNonce
  };
}

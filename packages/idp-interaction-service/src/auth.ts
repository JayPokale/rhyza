import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

// TODO: throw on startup if not configured
const idpSecret = process.env['IDP_SECRET'] || 'test-idp-secret-replace-me';

function cleanHeaders(
  headers: FastifyRequest['headers']
): Record<string, string> {
  const cleanHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    cleanHeaders[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  return cleanHeaders;
}

export function verifyIdpSecret(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const cleanedHeaders = cleanHeaders(request.headers);
  const requestSecret = cleanedHeaders['x-idp-secret'];

  if (requestSecret.length !== idpSecret.length) {
    reply.status(401).send();
    return;
  }

  if (
    !crypto.timingSafeEqual(Buffer.from(requestSecret), Buffer.from(idpSecret))
  ) {
    reply.status(401).send();
  }
}

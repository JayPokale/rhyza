import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';

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
  // TODO: validate or require this on startup
  const appSecret = process.env['IDP_SECRET'] as string;

  if (
    requestSecret.length !== appSecret.length
  ) {
    reply.status(401).send();
    return;
  }

  if (!crypto.timingSafeEqual(
    Buffer.from(requestSecret), Buffer.from(appSecret))) {
    reply.status(401).send();
  }
}

import {
  IPalJsonWebKeyDto,
  IPalWalletAddressKeyDto
} from '../types/wallet-addresses';
import { PbJsonWebKey, PbWalletAddressKey } from '../proto_generated';

export function jsonWebKeyFromPb(pb: PbJsonWebKey): IPalJsonWebKeyDto {
  return {
    kid: pb.getKid(),
    alg: pb.getAlg(),
    kty: pb.getKty(),
    crv: pb.getCrv(),
    x: pb.getX(),
    ...(pb.hasUse() && pb.getUse() ? { use: pb.getUse() } : {})
  };
}

export function jsonWebKeyToPb(jwk: IPalJsonWebKeyDto): PbJsonWebKey {
  const pb = new PbJsonWebKey()
    .setKid(jwk.kid)
    .setAlg(jwk.alg)
    .setKty(jwk.kty)
    .setCrv(jwk.crv)
    .setX(jwk.x);

  if (jwk.use) {
    pb.setUse(jwk.use);
  }

  return pb;
}

export function walletAddressKeyFromPb(
  pb: PbWalletAddressKey
): IPalWalletAddressKeyDto {
  const pbJwk = pb.getJwk();
  if (!pbJwk) {
    throw new Error(`Wallet address key ${pb.getId()} is missing a JWK`);
  }

  const key: IPalWalletAddressKeyDto = {
    id: pb.getId(),
    walletAddressId: pb.getWalletAddressId(),
    jwk: jsonWebKeyFromPb(pbJwk),
    revoked: pb.getRevoked()
  };

  const revokedAt = pb.getRevokedAt();
  if (pb.hasRevokedAt() && revokedAt !== undefined) {
    key.revokedAt = new Date(revokedAt);
  }

  return key;
}

export function walletAddressKeyToPb(
  key: IPalWalletAddressKeyDto
): PbWalletAddressKey {
  const pb = new PbWalletAddressKey()
    .setId(key.id)
    .setWalletAddressId(key.walletAddressId)
    .setJwk(jsonWebKeyToPb(key.jwk))
    .setRevoked(key.revoked);

  if (key.revokedAt) {
    pb.setRevokedAt(key.revokedAt.getTime());
  }

  return pb;
}

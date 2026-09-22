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

  return {
    id: pb.getId(),
    walletAddressId: pb.getWalletAddressId(),
    jwk: jsonWebKeyFromPb(pbJwk)
  };
}

export function walletAddressKeyToPb(
  key: IPalWalletAddressKeyDto
): PbWalletAddressKey {
  return new PbWalletAddressKey()
    .setId(key.id)
    .setWalletAddressId(key.walletAddressId)
    .setJwk(jsonWebKeyToPb(key.jwk));
}

export type IPalFxRateDto = {
  id: string;
  sourceAssetCode: string;
  destinationAssetCode: string;
  rateType: 'IntraFspRate' | 'PeerRate';
  acquisitionMethod: 'PulledFromFsp' | 'PushedByFsp';
  peerId: string | null; // null for InternalRates
  rate: number;
  fetchedAt: number | null; // null for set directly from FSP
  expiresAt: number | null;
};

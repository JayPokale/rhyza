export interface Asset {
  scale: number;
  code: string;
}

export interface Amount {
  assetCode: string;
  assetScale: number;
  value: bigint;
}

export interface AmountSerialized {
  assetCode: string;
  assetScale: number;
  value: string;
}

/**
 * Prepares an Amount for transport or storage by converting it
 * to a JSON-serializable form.
 */
export function serializeAmount(amount: Amount): AmountSerialized {
  return {
    ...amount,
    value: amount.value.toString(),
  };
}

/**
 * Restores a serialized Amount to its original in-memory representation.
 */
export function deserializeAmount(serialized: AmountSerialized): Amount {
  return {
    ...serialized,
    value: BigInt(serialized.value),
  };
}

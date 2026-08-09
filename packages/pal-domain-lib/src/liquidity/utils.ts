import {LedgerPrecisionLossError} from "./errors";

// Allows optional negative sign, digits, and optional decimal point with digits
const STRICT_NUMBER_REGEX = /^\d*$/;

/**
 * Converts a string-represented int amount with a given source scale into a BigInt scaled to DEFAULT_DISPLAY_ASSET_SCALE.
 *
 * @param sourceAmount - Integer amount string (e.g., "123456", "-1", "100")
 * @param sourceScale - Decimal precision of sourceAmount (e.g., 2 if "123.45" represents 123.456)
 * @param targetScale - Destination decimal precision of output integer string
 * @returns BigInt scaled to DEFAULT_DISPLAY_ASSET_SCALE (20)
 */

export function amountToBigIntOfSize(sourceAmount:string, sourceScale:number, targetScale: number): bigint {
  const trimmed = sourceAmount.trim();
  const isNegative = trimmed.startsWith("-");
  const absoluteAmount = isNegative ? trimmed.slice(1) : trimmed;

  if(absoluteAmount.length < sourceScale) {
    throw new LedgerPrecisionLossError(
      `Loss of precision: sourceAmount (${sourceAmount}) is smaller than sourceScale (${sourceScale}).`
    );
  }

  // Validate that the input is strictly an integer
  if (!STRICT_NUMBER_REGEX.test(absoluteAmount)) {
    throw new Error(`Invalid integer amount: "${sourceAmount}"`);
  }

  const scaleDiff = targetScale - sourceScale;

  if (scaleDiff < 0) {
    throw new LedgerPrecisionLossError(
      `Loss of precision: sourceScale (${sourceScale}) cannot exceed targetScale (${targetScale}).`
    );
  }

  // Parse directly as BigInt
  let baseAmount = BigInt(absoluteAmount);
  if(isNegative) {
    baseAmount = -baseAmount;
  }

  // Apply scale difference multiplier
  if (scaleDiff > 0) {
    return baseAmount * (10n ** BigInt(scaleDiff));
  }

  return baseAmount;
}


/**
 * Converts a raw BigInt amount from `sourceScale` into a formatted int string scaled to `targetScale`.
 *
 * @param sourceAmount - BigInt amount (e.g., 10n, 10000n, 10000000000000000000n)
 * @param sourceScale - The precision scale of the incoming BigInt
 * @param targetScale - Desired precision scale for the output int string
 * @returns Formatted decimal string (e.g., "10", "10", "123")
 */
export function amountFromBigIntOfSize(
  sourceAmount: bigint,
  sourceScale: number,
  targetScale: number
): string {
  const scaleDiff = targetScale - sourceScale;

  // same scale
  if (scaleDiff == 0) {
    return sourceAmount.toString();
  }

  // target scale is bigger, increase zeros
  if (scaleDiff > 0) {
    return (sourceAmount * 10n ** BigInt(scaleDiff)).toString();
  }

  // target scale is smaller, clip zeros if possible
  const divisor = 10n ** BigInt(Math.abs(scaleDiff));
  const remainder = sourceAmount % divisor;

  // check if non-zero digits are being lost
  if (remainder == 0n) {
    return (sourceAmount / divisor).toString();
  }

  // we can't return decimals, so anything else is a loss of precision
  throw new LedgerPrecisionLossError(
    `Precision loss error: Cannot convert amount  ${sourceAmount} from scale ${sourceScale} to ${targetScale} without discarding non-zero digits (${remainder}).`
  );

  /* if (sourceScale + scaleDiff >= targetScale) {
     // try adding the decimal separator if possible
     const isNegative = sourceAmount < 0;
     let remainderLength = remainder.toString().length;
     if (isNegative) {
       sourceAmount *= -1n;
     }

     let ret = Number(sourceAmount) / Number(divisor);
     ret = isNegative ? ret * -1 : ret;
     console.log(ret);
     return ret.toString();

     // add leading zero if smaller than 1
     // if (sourceAmount.toString().length == sourceScale) {
     //   return isNegative
     //     ? `-0.${sourceAmount.toString()}`
     //     : `0.${sourceAmount.toString()}`;
     // } else if(sourceAmount.toString().length == targetScale) {
     //
     // }

     // let intPart = sourceAmount.toString().substring(0, remainderLength - 1);
     // let decPart = sourceAmount.toString().substring(remainderLength - 1);
     // if (intPart.length <= 0) {
     //   intPart = '0';
     // }
     // if (decPart.length < remainderLength - 1) {
     //   decPart = decPart.padStart(remainderLength, '0');
     // }
     // const ret = isNegative ? `-${intPart}.${decPart}` : `${intPart}.${decPart}`;
     // console.log(ret);
     // return ret;
   }

   throw new LedgerPrecisionLossError(
     `Precision loss error: Cannot convert amount  ${sourceAmount} from scale ${sourceScale} to ${targetScale} without discarding non-zero digits (${remainder}).`
   );*/
}


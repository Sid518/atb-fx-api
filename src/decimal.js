import { ApiError } from './errors.js';

const MAX_AMOUNT = 1_000_000_000_000n;

/** Parse a JSON number's source text into coefficient / 10^scale, exactly. */
export function parseAmount(source) {
  const match = typeof source === 'string' && source.length <= 128
    && /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount must be a JSON number.', 'amount');
  }

  const [, sign, whole, fraction = '', exponentText = '0'] = match;
  const exponent = Number(exponentText);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount exponent must be between -100 and 100.', 'amount');
  }
  let coefficient = BigInt(whole + fraction);
  let scale = fraction.length - exponent;
  if (sign && coefficient !== 0n) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount must be non-negative.', 'amount');
  }
  // Normalizing zero and trailing zeros also accepts 1.230000 and scientific notation.
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (scale > 12) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount supports up to 12 decimal places.', 'amount');
  }
  if (coefficient > MAX_AMOUNT * 10n ** BigInt(scale)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount must not exceed 1000000000000.', 'amount');
  }
  return { coefficient, scale };
}

/** Format a non-negative integer in fixed-point notation without Number conversion. */
export function formatScaled(integer, places) {
  if (places === 0) return integer.toString();
  const digits = integer.toString().padStart(places + 1, '0');
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

/** Round a non-negative rational to fixed decimal places, ties to the even digit. */
export function roundRatio(numerator, denominator, places) {
  const scaled = numerator * 10n ** BigInt(places);
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  const twiceRemainder = 2n * remainder;
  const increment = twiceRemainder > denominator
    || (twiceRemainder === denominator && quotient % 2n === 1n);
  return formatScaled(quotient + (increment ? 1n : 0n), places);
}

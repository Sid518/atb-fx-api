import { ApiError } from './errors.js';
import { CURRENCIES, RATES, supports } from './rates.js';
import { formatScaled, parseAmount, roundRatio } from './decimal.js';

/** Pure conversion: decimal strings in/out keep binary floats outside the money path. */
export function convert(from, to, amountSource) {
  for (const [field, currency] of [['from', from], ['to', to]]) {
    if (typeof currency !== 'string' || !supports(currency)) {
      throw new ApiError(400, 'UNSUPPORTED_CURRENCY',
        `${field} must be one of: ${CURRENCIES.join(', ')}.`, field);
    }
  }
  const { coefficient, scale } = parseAmount(amountSource);
  // Both supplied rates have the same base and scale; they cancel in the ratio.
  // Do not round an intermediate CAD amount or use the displayed exchange rate.
  return {
    from,
    to,
    originalAmount: formatScaled(coefficient, scale),
    convertedAmount: roundRatio(coefficient * RATES[to],
      10n ** BigInt(scale) * RATES[from], 2),
    exchangeRate: roundRatio(RATES[to], RATES[from], 12),
  };
}

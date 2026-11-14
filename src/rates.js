// Integer hundredths of the supplied CAD-based rates. No floating-point literals.
export const RATES = Object.freeze({
  CAD: 100n,
  USD: 72n,
  EUR: 66n,
  GBP: 57n,
  AUD: 109n,
  JPY: 10950n,
});

export const CURRENCIES = Object.freeze(Object.keys(RATES));

export function supports(currency) {
  return Object.hasOwn(RATES, currency);
}

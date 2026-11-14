import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatScaled, parseAmount, roundRatio } from '../src/decimal.js';

for (const [token, coefficient, scale] of [
  ['0', 0n, 0], ['-0.0', 0n, 0], ['1.23000', 123n, 2],
  ['1e2', 100n, 0], ['12.3e-2', 123n, 3], ['1E+3', 1000n, 0],
  ['0.000000000001', 1n, 12], ['1000000000000', 1000000000000n, 0],
]) {
  test(`parse exact amount ${token}`, () => {
    assert.deepEqual(parseAmount(token), { coefficient, scale });
  });
}

for (const token of [undefined, '', '01', '+1', 'NaN', 'Infinity', '-1', '-0.001',
  '1e101', '1e-101', '1e99999999999999999999', '0.0000000000001',
  '1000000000000.000000000001', '1e13', '1'.repeat(129)]) {
  test(`reject invalid or out-of-range amount ${String(token).slice(0, 40)}`, () => {
    assert.throws(() => parseAmount(token), { code: 'INVALID_AMOUNT', status: 400 });
  });
}

for (const [numerator, denominator, expected] of [
  [1004n, 1000n, '1.00'], [1005n, 1000n, '1.00'],
  [1006n, 1000n, '1.01'], [1015n, 1000n, '1.02'],
  [9995n, 1000n, '10.00'], [0n, 1n, '0.00'],
]) {
  test(`half-even rounding ${numerator}/${denominator} -> ${expected}`, () => {
    assert.equal(roundRatio(numerator, denominator, 2), expected);
  });
}

test('format sub-unit and whole decimal values', () => {
  assert.equal(formatScaled(5n, 3), '0.005');
  assert.equal(formatScaled(123n, 0), '123');
});

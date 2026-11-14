import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { convert } from '../src/conversion.js';
import { CURRENCIES, RATES } from '../src/rates.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/conversions.json', import.meta.url), 'utf8'));
for (const row of fixtures) {
  test(`reference: ${row.amount} ${row.from} -> ${row.to}`, () => {
    const result = convert(row.from, row.to, row.amount);
    assert.equal(result.convertedAmount, row.convertedAmount);
    assert.equal(result.exchangeRate, row.exchangeRate);
  });
}

test('assignment example', () => {
  assert.deepEqual(convert('CAD', 'USD', '100.00'), {
    from: 'CAD', to: 'USD', originalAmount: '100',
    convertedAmount: '72.00', exchangeRate: '0.720000000000',
  });
});

test('cross conversion uses the source rate, not just the destination rate', () => {
  assert.equal(convert('USD', 'EUR', '100').convertedAmount, '91.67');
  assert.equal(convert('JPY', 'GBP', '10000').convertedAmount, '52.05');
});

test('the displayed rate must never drive the amount calculation', () => {
  // 1e12 * 0.917431192661 (rounded display rate) would incorrectly give .00.
  assert.equal(convert('AUD', 'CAD', '1000000000000').convertedAmount, '917431192660.55');
});

test('round once at the destination; an intermediate CAD cent loses money', () => {
  assert.equal(convert('JPY', 'AUD', '1').convertedAmount, '0.01');
});

test('exact tokens either side of a tie remain distinct despite Number coercion', () => {
  assert.equal(convert('CAD', 'CAD', '999999999999.985').convertedAmount, '999999999999.98');
  assert.equal(convert('CAD', 'CAD', '999999999999.985000000001').convertedAmount, '999999999999.99');
});

test('currency codes are exact and own properties only', () => {
  for (const code of ['BTC', 'cad', ' USD', '__proto__', 'constructor', null, 123]) {
    assert.throws(() => convert(code, 'CAD', '1'), { code: 'UNSUPPORTED_CURRENCY', field: 'from' });
    assert.throws(() => convert('CAD', code, '1'), { code: 'UNSUPPORTED_CURRENCY', field: 'to' });
  }
});

test('all 216 paths agree when intermediate amounts are exactly representable', () => {
  // Choosing RATES[a] as the input makes the intermediate amount exactly RATES[b].
  // General rounded round trips need not agree, so do not assert that false invariant.
  for (const a of CURRENCIES) for (const b of CURRENCIES) for (const c of CURRENCIES) {
    const intermediate = convert(a, b, RATES[a].toString());
    const viaB = convert(b, c, intermediate.convertedAmount);
    const direct = convert(a, c, RATES[a].toString());
    assert.equal(viaB.convertedAmount, direct.convertedAmount);
  }
});

test('seeded cases are monotonic and their rounding error never exceeds half a cent', () => {
  let seed = 123456789;
  for (let i = 0; i < 2000; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const source = CURRENCIES[i % 6];
    const target = CURRENCIES[Math.floor(i / 6) % 6];
    const units = BigInt(seed);
    const amount = `${units / 1000n}.${(units % 1000n).toString().padStart(3, '0')}`;
    const converted = convert(source, target, amount).convertedAmount;
    const cents = BigInt(converted.replace('.', ''));
    const exactNumerator = units * RATES[target] * 100n;
    const denominator = 1000n * RATES[source];
    const delta = cents * denominator - exactNumerator;
    assert.ok((delta < 0n ? -delta : delta) * 2n <= denominator);
    const bigger = convert(source, target, `${units / 1000n + 1n}`).convertedAmount;
    assert.ok(BigInt(bigger.replace('.', '')) >= cents);
  }
});

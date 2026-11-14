import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRequest } from '../src/request.js';

test('capture the original numeric source, not a rounded Number', () => {
  assert.deepEqual(parseRequest('{"from":"CAD","to":"USD","amount":999999999999.985000000001}'), {
    from: 'CAD', to: 'USD', amountSource: '999999999999.985000000001',
  });
});

for (const body of ['{', '', '{"amount": NaN}', '{"amount": Infinity}']) {
  test(`reject malformed JSON ${body}`, () => {
    assert.throws(() => parseRequest(body), { code: 'INVALID_JSON' });
  });
}
for (const body of ['null', '[]', '1', 'true', '"hello"']) {
  test(`reject non-object JSON ${body}`, () => {
    assert.throws(() => parseRequest(body), { code: 'INVALID_REQUEST' });
  });
}
for (const field of ['from', 'to', 'amount']) {
  test(`reject missing ${field}`, () => {
    const data = { from: 'CAD', to: 'USD', amount: 1 };
    delete data[field];
    assert.throws(() => parseRequest(JSON.stringify(data)), { code: 'MISSING_FIELD', field });
  });
}
for (const value of ['"100"', 'null', 'true', '{}', '[]', '1e400']) {
  test(`reject non-finite/non-numeric amount ${value}`, () => {
    assert.throws(() => parseRequest(`{"from":"CAD","to":"USD","amount":${value}}`), { code: 'INVALID_AMOUNT' });
  });
}
test('reject unexpected fields rather than silently ignoring caller mistakes', () => {
  assert.throws(() => parseRequest('{"from":"CAD","to":"USD","amount":1,"ammount":2}'), { code: 'INVALID_REQUEST' });
});
test('JSON duplicate keys follow standard last-value-wins semantics', () => {
  const parsed = parseRequest('{"from":"CAD","to":"USD","amount":1,"amount":2.005}');
  assert.equal(parsed.amountSource, '2.005');
});

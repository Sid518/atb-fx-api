import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

// A self-contained demonstration: no separate terminal or running server needed.
const server = createApp();
server.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  for (const [label, body, expectedStatus, expectedAmount] of [
    ['Assignment example', '{"from":"CAD","to":"USD","amount":100}', 200, 72],
    ['Cross-currency conversion', '{"from":"USD","to":"EUR","amount":100}', 200, 91.67],
    ['Exact rounding boundary', '{"from":"CAD","to":"CAD","amount":1.015}', 200, 1.02],
    ['Precision preserved from request', '{"from":"CAD","to":"CAD","amount":999999999999.985000000001}', 200, 999999999999.99],
    ['Helpful validation', '{"from":"CAD","to":"BTC","amount":100}', 400, undefined],
  ]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/convert`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    });
    const text = await response.text();
    assert.equal(response.status, expectedStatus);
    if (expectedAmount !== undefined) assert.equal(JSON.parse(text).convertedAmount, expectedAmount);
    console.log(`\n${label}\nPOST /convert ${body}\nHTTP ${response.status}\n${text}`);
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}

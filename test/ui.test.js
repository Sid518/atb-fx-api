import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let base;
test('page script converts the selected currencies and displays the received amount', async () => {
  const html = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: selector === '#amount' ? '100' : selector === '#from' ? 'CAD' : 'USD',
      textContent: '', firstElementChild: {}, listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      focus() {},
    });
    return elements.get(selector);
  }
  runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { querySelector: element, querySelectorAll: () => [] },
    AbortController,
    fetch: (path, options) => fetch(base + path, options),
  });
  await element('#converter').listeners.submit({ preventDefault() {} });
  assert.equal(element('#result-amount').textContent, '72.00');
  assert.equal(element('#result-currency').textContent, 'USD');
  assert.equal(element('#status').textContent, 'Conversion complete.');
});
before(async () => {
  const indexHtml = readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8');
  server = createApp({ indexHtml });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

test('optional UI serves the converter at GET /', async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  const html = await response.text();
  assert.match(html, /id="converter"/);
  assert.match(html, /id="amount"/);
  assert.match(html, /id="from"/);
  assert.match(html, /id="to"/);
});
test('optional UI uses the unchanged numeric API contract', async () => {
  const response = await fetch(base + '/convert', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{"from":"USD","to":"EUR","amount":100}',
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.convertedAmount, 91.67);
  assert.equal(typeof data.convertedAmount, 'number');
});
test('both currency dropdowns offer every supported currency with the correct default', async () => {
  const html = await (await fetch(base)).text();
  for (const [id, defaultCode] of [['from', 'CAD'], ['to', 'USD']]) {
    const select = html.match(new RegExp(`<select\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select, `${id} must be a dropdown, not a filtered autocomplete input`);
    const options = [...select[1].matchAll(/<option value="([A-Z]+)"([^>]*)>/g)];
    assert.deepEqual(options.map(option => option[1]), ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY']);
    assert.equal(options.find(option => /\bselected\b/.test(option[2]))?.[1], defaultCode);
  }
});
test('optional UI does not turn other paths into pages', async () => {
  assert.equal((await fetch(base + '/missing')).status, 404);
  assert.equal((await fetch(base + '/convert')).status, 405);
});
test('optional UI does not accept POST /', async () => {
  assert.equal((await fetch(base, { method: 'POST' })).status, 404);
});

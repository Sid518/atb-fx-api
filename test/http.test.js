import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { CURRENCIES } from '../src/rates.js';

let server;
let port;
const unexpectedErrors = [];
before(async () => {
  server = createApp({ onError: error => unexpectedErrors.push(error) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  port = server.address().port;
});
after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert.equal(unexpectedErrors.length, 0);
});

function request(body = '{"from":"CAD","to":"USD","amount":100}', options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1', port, path: '/convert', method: 'POST',
      headers: { 'Content-Type': 'application/json' }, ...options,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        resolve({ status: response.statusCode, headers: response.headers, text,
          body: text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject);
    // Several writes without Content-Length exercise the chunked transfer path.
    if (Array.isArray(body)) {
      for (const chunk of body) req.write(chunk);
      req.end();
    } else req.end(body);
  });
}

test('POST /convert matches the assignment contract, with numeric JSON fields', async () => {
  const result = await request();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { from: 'CAD', to: 'USD', originalAmount: 100,
    convertedAmount: 72, exchangeRate: 0.72 });
  assert.match(result.headers['content-type'], /^application\/json/);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-content-type-options'], 'nosniff');
  assert.equal(Number(result.headers['content-length']), Buffer.byteLength(result.text));
});

test('every supported pair is reachable through real HTTP', async () => {
  for (const from of CURRENCIES) for (const to of CURRENCIES) {
    const result = await request(JSON.stringify({ from, to, amount: 100 }));
    assert.equal(result.status, 200, `${from} -> ${to}`);
    assert.equal(result.body.from, from);
    assert.equal(result.body.to, to);
  }
});

test('the original decimal survives parsing and serialization exactly', async () => {
  const result = await request('{"from":"CAD","to":"CAD","amount":999999999999.985000000001}');
  assert.equal(result.status, 200);
  assert.match(result.text, /"originalAmount":999999999999\.985000000001/);
  assert.match(result.text, /"convertedAmount":999999999999\.99/);
});

test('a half-even boundary reaches the HTTP response', async () => {
  const result = await request('{"from":"CAD","to":"CAD","amount":1.015}');
  assert.equal(result.body.convertedAmount, 1.02);
});

test('zero and same-currency conversion are accepted', async () => {
  const result = await request('{"from":"JPY","to":"JPY","amount":0}');
  assert.equal(result.body.convertedAmount, 0);
  assert.equal(result.body.exchangeRate, 1);
});

test('scientific notation is accepted', async () => {
  const result = await request('{"from":"CAD","to":"USD","amount":1e2}');
  assert.equal(result.body.convertedAmount, 72);
});

for (const contentType of ['application/json', 'application/json; charset=utf-8',
  'Application/JSON; charset="UTF-8"']) {
  test(`accept content type ${contentType}`, async () => {
    assert.equal((await request(undefined, { headers: { 'Content-Type': contentType } })).status, 200);
  });
}
for (const headers of [{}, { 'Content-Type': 'text/plain' },
  { 'Content-Type': 'application/json; charset=latin1' },
  { 'Content-Type': 'application/json; charset="utf-8' }]) {
  test(`reject unsupported content type ${JSON.stringify(headers)}`, async () => {
    const result = await request(undefined, { headers });
    assert.equal(result.status, 415);
    assert.equal(result.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  });
}

for (const [body, code] of [
  ['', 'INVALID_JSON'], ['{', 'INVALID_JSON'], ['null', 'INVALID_REQUEST'],
  ['[]', 'INVALID_REQUEST'], ['{}', 'MISSING_FIELD'],
  ['{"from":"USD","to":"CAD","amount":"10"}', 'INVALID_AMOUNT'],
  ['{"from":"USD","to":"CAD","amount":-1}', 'INVALID_AMOUNT'],
  ['{"from":"USD","to":"CAD","amount":1e400}', 'INVALID_AMOUNT'],
  ['{"from":"constructor","to":"CAD","amount":1}', 'UNSUPPORTED_CURRENCY'],
  ['{"from":"USD","to":"BTC","amount":1}', 'UNSUPPORTED_CURRENCY'],
]) {
  test(`HTTP client error ${code}: ${body}`, async () => {
    const result = await request(body);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, code);
    assert.equal(typeof result.body.error.message, 'string');
  });
}

test('wrong route returns 404', async () => {
  const result = await request(undefined, { path: '/missing' });
  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, 'NOT_FOUND');
});
test('wrong method returns 405 with Allow header', async () => {
  const result = await request('', { method: 'GET' });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, 'POST');
});
test('query strings do not change the endpoint', async () => {
  assert.equal((await request(undefined, { path: '/convert?example=1' })).status, 200);
});
test('unsupported compression returns 415', async () => {
  const result = await request(undefined, {
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
  });
  assert.equal(result.status, 415);
  assert.equal(result.body.error.code, 'UNSUPPORTED_ENCODING');
});
test('Content-Length above the limit returns 413', async () => {
  const result = await request(' '.repeat(8193), {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '8193' },
  });
  assert.equal(result.status, 413);
});
test('chunked bodies are bounded without relying on Content-Length', async () => {
  const result = await request([' '.repeat(4096), ' '.repeat(4096), ' ']);
  assert.equal(result.status, 413);
});
test('UTF-8 characters split across chunks are decoded together', async () => {
  const body = Buffer.from('{"from":"CAD","to":"USD","amount":1,"é":1}');
  const split = body.indexOf(Buffer.from('é')) + 1;
  const result = await request([body.subarray(0, split), body.subarray(split)]);
  assert.equal(result.body.error.code, 'INVALID_REQUEST');
});
test('invalid UTF-8 is rejected without replacement-character normalization', async () => {
  const result = await request(Buffer.from([0xc3, 0x28]));
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'INVALID_JSON');
});
test('unexpected failures return a safe 500 and are reported internally', async t => {
  const errors = [];
  const isolated = createApp({ onError: error => errors.push(error) });
  isolated.listen(0, '127.0.0.1');
  await once(isolated, 'listening');
  t.mock.method(JSON, 'rawJSON', () => { throw new Error('private implementation detail'); });
  try {
    const result = await request(undefined, { port: isolated.address().port });
    assert.equal(result.status, 500);
    assert.equal(result.body.error.code, 'INTERNAL_ERROR');
    assert.doesNotMatch(result.text, /private implementation detail/);
    assert.equal(errors.length, 1);
  } finally {
    t.mock.restoreAll();
    await new Promise(resolve => isolated.close(resolve));
  }
});

# FX Conversion API

A small Node.js REST API using the six fictional CAD-based exchange rates supplied
in the assignment. One endpoint, exact decimal arithmetic, explicit rounding,
and no runtime or development dependencies.

## Run in under a minute

Requires **Node.js 24 or newer**. The project uses standard `JSON.parse` source
access and `JSON.rawJSON` to preserve decimal values at the HTTP boundary.

```sh
npm ci --ignore-scripts
npm test
npm run demo
npm start
```

There are no packages to download. `npm ci` checks the committed lockfile;
`npm test` and `npm start` can also run directly. The server listens on port 3000.
Stop it with Ctrl+C. To use another port:

```sh
PORT=8080 npm start
```

PowerShell: `$env:PORT = '8080'; npm start`.

## Optional browser interface

Stop any existing server with Ctrl+C, then run:

```sh
npm run ui
```

Open **http://localhost:3000** in a current browser. Enter an amount, type or
choose the source and destination currencies, and press **Convert amount**.
Currency codes are normalized in the interface, so `eur` and `cad` work.
The API still requires uppercase codes when called directly.

The swap button reverses currencies while keeping the amount. Example buttons
perform common conversions, and an expandable panel shows the real request and
response. Editing inputs clears the previous result so it cannot be mistaken for
a conversion of the new values. All calculations run through the existing API.

`npm start` still starts the original API-only service. `npm run ui` adds just
`GET /` for the interface; both use the same `POST /convert` implementation and
port. There are no extra dependencies or frontend build steps. `npm run dev`
starts the browser interface with server watch mode for development.

The browser uses JSON source-token access for exact decimal display where
supported. Older browsers may fall back to their normal number precision.

`npm run demo` starts its own temporary server, demonstrates five requests, and
closes it automatically. It does not require a separate running server.

## Endpoint

`POST /convert` with `Content-Type: application/json`.

```sh
curl -i http://localhost:3000/convert -H 'Content-Type: application/json' -d '{"from":"CAD","to":"USD","amount":100.00}'
```

PowerShell alternative, with a running server:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/convert -Method Post -ContentType 'application/json' -Body '{"from":"CAD","to":"USD","amount":100.00}'
```

Response: `200 OK`

```json
{
  "from": "CAD",
  "to": "USD",
  "originalAmount": 100,
  "convertedAmount": 72.00,
  "exchangeRate": 0.720000000000
}
```

All three amount/rate fields are JSON **numbers**, matching the assignment.
JSON numeric trailing zeros do not change a value. A JSON viewer may display
`72.00` as `72` and `0.720000000000` as `0.72`.

### Supplied rates

| Currency | Units per CAD |
| --- | ---: |
| CAD | 1.00 |
| USD | 0.72 |
| EUR | 0.66 |
| GBP | 0.57 |
| AUD | 1.09 |
| JPY | 109.50 |

All 36 source/destination pairs are supported, including same-currency pairs.
For example, `100 USD -> EUR` returns `91.67`, with displayed rate
`0.916666666667`.

### Input and rounding decisions

The brief leaves these policies open; this implementation makes them explicit:

- `from` and `to` are uppercase currency codes, with no automatic trimming or
  case conversion. Invalid codes receive a list of supported values.
- `amount` is a JSON number from zero through 1,000,000,000,000 inclusive.
  Numeric strings, booleans, nulls, negative values, and non-finite values are
  rejected. Signed zero is accepted and normalized to zero.
- Up to 12 fractional decimal places are accepted after removing trailing zeros.
  Scientific notation is supported. Numeric tokens are limited to 128 characters
  and exponents to -100 through 100 to bound parsing work.
- Converted amounts use **two decimal places for every currency**, including JPY,
  to keep a single output policy for this exercise. A production currency policy
  would normally assign currency-specific minor units.
- Rounding is **half to even**: `1.005 -> 1.00`, `1.015 -> 1.02`.
  This avoids a systematic upward preference on ties. It is an implementation
  decision, not a claim about a required ATB policy. Same-currency conversions
  also apply the documented output rounding.
- The displayed exchange rate uses 12 decimal places, also half to even. The
  converted amount is calculated from the **exact ratio**, never that display rate.
- Extra fields are rejected to catch misspellings. Duplicate JSON keys use
  standard last-value-wins parsing semantics.
- Only UTF-8 JSON is accepted, optionally with `charset=utf-8`. Compressed bodies
  are unsupported. The body limit is 8 KiB, including chunked requests.

### Errors

For `{"from":"CAD","to":"BTC","amount":100}`:

```json
{
  "error": {
    "code": "UNSUPPORTED_CURRENCY",
    "message": "to must be one of: CAD, USD, EUR, GBP, AUD, JPY.",
    "field": "to"
  }
}
```

| Status | Meaning |
| --- | --- |
| 200 | Conversion succeeded |
| 400 | Invalid JSON, invalid request shape, missing field, invalid amount, or unsupported currency |
| 404 | Unknown path |
| 405 | Unsupported method; response includes `Allow: POST` |
| 413 | Body exceeds 8 KiB |
| 415 | Unsupported content type, charset, or content encoding |
| 500 | Unexpected failure; internal details are logged, not returned |

Responses use `Cache-Control: no-store`. The HTTP server has finite request/header
timeouts, and the entry point handles SIGINT/SIGTERM for orderly shutdown.

## Why the arithmetic is different

The mathematical conversion is small:

```text
destination amount = source amount * destination CAD-rate / source CAD-rate
```

Represent the supplied rates as integer hundredths (`USD = 72`, `JPY = 10950`),
and represent an input decimal as an integer coefficient plus a scale. Their
common rate scale cancels. The calculation is then integer multiplication and
division using `BigInt`, followed by one explicit rounding step.

Precision must also survive parsing. `JSON.parse` normally converts a number to
an IEEE-754 `Number` before application code sees it. The request parser uses its
reviver's `context.source` to retrieve the original amount token. The response
uses `JSON.rawJSON` with internally generated valid decimal literals, preserving
numeric JSON fields without first coercing them through `Number`.

For example, these inputs would become indistinguishable with ordinary Number
parsing, but lie on different sides of a rounding tie:

```text
999999999999.985           -> 999999999999.98 CAD
999999999999.985000000001  -> 999999999999.99 CAD
```

The response bytes are exact under the declared policy. A client that parses
numbers into IEEE-754 may still lose precision locally. In a production API,
decimal strings or integer minor units would be worth agreeing with clients.
The numeric contract here follows the supplied exercise.

This is deliberately a narrow arithmetic module for non-negative decimal amounts
and the supplied rates, not a general-purpose decimal library. Runtime work is
bounded by input length and precision; each conversion uses constant-time table
lookups and a fixed number of bounded integer operations.

## Verification

```sh
npm test
npm run test:coverage
```

The suite contains **311 tests**:

- 216 exact reference cases covering all 36 pairs at six representative amounts.
  The committed expected values were generated independently with Python's
  `fractions.Fraction`, not by the JavaScript implementation.
- Decimal parsing, half-even ties, source-token precision, range limits,
  cross-rate direction, and avoiding intermediate rounding.
- 2,000 reproducible generated cases checking monotonicity and a maximum rounding
  error of half a cent. These run within one test and are not counted as 2,000 tests.
- All 216 three-currency paths with exactly representable intermediate values.
  General rounded round trips need not return their starting value.
- Real HTTP requests, numeric JSON fields, every supported pair, validation,
  method/path errors, content negotiation, chunked body limits, UTF-8 handling,
  and safe unexpected-error responses.

Measured on Node 24: **100% line, branch, and function coverage** for the API and
conversion modules. `src/server.js` is the process entry point and is explicitly
excluded from the coverage report; this is not a claim of whole-process coverage.

Python is optional and needed only to regenerate reference fixtures:

```sh
python3 scripts/generate-fixtures.py
```

The workflow in `.github/workflows/test.yml` runs tests, coverage, and the demo
when hosted on GitHub. That hosted workflow must run after the repository is pushed.

## Source map

| File | Responsibility |
| --- | --- |
| `src/rates.js` | Immutable supplied rate table |
| `src/decimal.js` | Exact amount parsing, decimal formatting, half-even rounding |
| `src/conversion.js` | Pure currency conversion and currency validation |
| `src/request.js` | JSON parsing, request validation, exact amount-token capture |
| `src/app.js` | HTTP boundary, body limits, status codes, response serialization |
| `src/server.js` | Port configuration, startup, shutdown, optional UI mode |
| `ui/index.html` | Optional browser converter; calls the same API |
| `test/` | Unit tests, independent fixtures, generated checks, HTTP integration tests |

## Scope and next decisions

The service uses only the fictional static rates. There is no database, external
rate feed, authentication, or persistence requirement in this exercise. The browser
interface is an optional demonstration and is disabled in API-only mode.
A production deployment would need agreed rounding/currency policies, a decimal
client contract, authenticated access where appropriate, infrastructure-level
traffic controls, monitoring, and rate freshness/versioning.

The included ZIP preserves the local Git repository and its actual commit history.
After extracting, `git log --oneline` and `git status` work normally. To submit the
requested hosted repository, create an empty GitHub/GitLab repository, then run:

```sh
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

Confirm that the reviewer has access to the repository before sending its URL.

## AI assistance

I used ChatGPT/Codex throughout this assignment. AI generated substantial portions of the implementation, automated tests, optional browser interface, and documentation.

The assistance included:

- Clarifying requirements, assumptions, and edge cases.
- Developing the exact-decimal conversion approach using `BigInt`, preserving numeric precision through JSON parsing and serialization, and documenting rounding decisions.
- Implementing request validation, HTTP error handling, and the browser interface.
- Generating test cases and Python reference fixtures to cross-check the JavaScript calculations.
- Reviewing numerical precision, error handling, and implementation complexity.

My verification included running the automated test suite and demonstration locally, sending requests through PowerShell, and checking conversions in the browser interface. Examples included confirming that 100 USD converts to 91.67 EUR and 100 EUR converts to 109.09 USD using the supplied rates.

The test results, reference fixtures, and documented assumptions provide reproducible checks of the implementation. AI-generated code and tests are included in this submission.

## References

- [ECMAScript JSON parsing and serialization](https://tc39.es/ecma262/multipage/structured-data.html)
- [Node.js test runner](https://nodejs.org/docs/latest-v24.x/api/test.html)
- [Python Fraction rounding](https://docs.python.org/3/library/fractions.html)

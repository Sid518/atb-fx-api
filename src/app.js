import { createServer } from 'node:http';
import { TextDecoder } from 'node:util';
import { convert } from './conversion.js';
import { ApiError } from './errors.js';
import { parseRequest } from './request.js';

const BODY_LIMIT = 8192;

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new ApiError(413, 'BODY_TOO_LARGE', 'Request body must not exceed 8192 bytes.'));
      } else {
        chunks.push(chunk);
      }
    });
    request.on('end', () => {
      try {
        resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        reject(new ApiError(400, 'INVALID_JSON', 'Request body must be valid UTF-8 JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function send(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  response.end(body);
}

/** Each server is independent, so tests use real HTTP on an ephemeral port. */
export function createApp({ onError = console.error } = {}) {
  return createServer({ requestTimeout: 10_000, headersTimeout: 10_000 }, async (request, response) => {
    try {
      if (request.url.split('?')[0] !== '/convert') {
        throw new ApiError(404, 'NOT_FOUND', 'Use POST /convert.');
      }
      if (request.method !== 'POST') {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Only POST is supported for /convert.');
      }
      if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers['content-type'] ?? '')) {
        throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use Content-Type: application/json with UTF-8 encoding.');
      }
      if ((request.headers['content-encoding'] ?? 'identity').toLowerCase() !== 'identity') {
        throw new ApiError(415, 'UNSUPPORTED_ENCODING', 'Compressed request bodies are not supported.');
      }
      if (Number(request.headers['content-length'] ?? 0) > BODY_LIMIT) {
        throw new ApiError(413, 'BODY_TOO_LARGE', 'Request body must not exceed 8192 bytes.');
      }
      const { from, to, amountSource } = parseRequest(await readBody(request));
      const result = convert(from, to, amountSource);
      send(response, 200, {
        ...result,
        // Standard JSON numbers on the wire, without first coercing exact decimals to Number.
        originalAmount: JSON.rawJSON(result.originalAmount),
        convertedAmount: JSON.rawJSON(result.convertedAmount),
        exchangeRate: JSON.rawJSON(result.exchangeRate),
      });
    } catch (error) {
      request.resume();
      const expected = error instanceof ApiError;
      if (!expected) onError(error);
      const status = expected ? error.status : 500;
      const details = {
        code: expected ? error.code : 'INTERNAL_ERROR',
        message: expected ? error.message : 'An unexpected error occurred.',
      };
      if (expected && error.field) details.field = error.field;
      send(response, status, { error: details }, {
        ...(status === 405 ? { Allow: 'POST' } : {}),
        Connection: 'close',
      });
    }
  });
}

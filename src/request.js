import { ApiError } from './errors.js';

/** Preserve the top-level amount token, even if JSON.parse's Number loses precision. */
export function parseRequest(text) {
  const sources = new WeakMap();
  let payload;
  try {
    payload = JSON.parse(text, function (key, value, context) {
      if (key === 'amount' && typeof value === 'number') sources.set(this, context.source);
      return value;
    });
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Request body must be a JSON object.');
  }
  for (const field of ['from', 'to', 'amount']) {
    if (!Object.hasOwn(payload, field)) {
      throw new ApiError(400, 'MISSING_FIELD', `${field} is required.`, field);
    }
  }
  if (Object.keys(payload).some(key => !['from', 'to', 'amount'].includes(key))) {
    throw new ApiError(400, 'INVALID_REQUEST', 'Only from, to, and amount are accepted.');
  }
  if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) {
    throw new ApiError(400, 'INVALID_AMOUNT', 'amount must be a finite JSON number.', 'amount');
  }
  return { from: payload.from, to: payload.to, amountSource: sources.get(payload) };
}

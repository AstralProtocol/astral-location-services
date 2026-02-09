/**
 * Structured assertions returning { pass, message, details }.
 * Shared between CLI and dashboard.
 */

/**
 * Assert a numeric result (distance, area, length).
 */
export function assertNumericResult(body, { min, max, units, operation }) {
  const details = { expected: { min, max, units, operation }, actual: body };

  if (!body || body.result === undefined) {
    return { pass: false, message: 'Response missing result field', details };
  }

  if (typeof body.result !== 'number') {
    return { pass: false, message: `result is ${typeof body.result}, expected number`, details };
  }

  if (min !== undefined && body.result < min) {
    return { pass: false, message: `result ${body.result} < min ${min}`, details };
  }

  if (max !== undefined && body.result > max) {
    return { pass: false, message: `result ${body.result} > max ${max}`, details };
  }

  if (units && body.units !== units) {
    return { pass: false, message: `units "${body.units}" !== expected "${units}"`, details };
  }

  if (operation && body.operation !== operation) {
    return { pass: false, message: `operation "${body.operation}" !== expected "${operation}"`, details };
  }

  return { pass: true, message: `result ${body.result} in range [${min ?? '-inf'}, ${max ?? 'inf'}]`, details };
}

/**
 * Assert a boolean result (contains, within, intersects).
 */
export function assertBooleanResult(body, { expected, operation }) {
  const details = { expected: { expected, operation }, actual: body };

  if (!body || body.result === undefined) {
    return { pass: false, message: 'Response missing result field', details };
  }

  if (typeof body.result !== 'boolean') {
    return { pass: false, message: `result is ${typeof body.result}, expected boolean`, details };
  }

  if (expected !== undefined && body.result !== expected) {
    return { pass: false, message: `result ${body.result} !== expected ${expected}`, details };
  }

  if (operation && body.operation !== operation) {
    return { pass: false, message: `operation "${body.operation}" !== expected "${operation}"`, details };
  }

  return { pass: true, message: `result ${body.result} === ${expected}`, details };
}

/**
 * Assert that an attestation structure is present and complete.
 */
export function assertAttestationStructure(body) {
  const details = { actual: body };
  const required = ['attestation', 'delegatedAttestation'];

  for (const key of required) {
    if (!body || !body[key]) {
      return { pass: false, message: `Response missing "${key}"`, details };
    }
  }

  const att = body.attestation;
  const attFields = ['schema', 'recipient', 'data', 'signature'];
  for (const key of attFields) {
    if (!att[key]) {
      return { pass: false, message: `attestation missing "${key}"`, details };
    }
  }

  if (!att.schema.startsWith('0x') || att.schema.length !== 66) {
    return { pass: false, message: `attestation.schema invalid format: ${att.schema}`, details };
  }

  if (!att.signature.startsWith('0x')) {
    return { pass: false, message: `attestation.signature missing 0x prefix`, details };
  }

  const del = body.delegatedAttestation;
  if (del.attester === undefined) {
    return { pass: false, message: 'delegatedAttestation missing "attester"', details };
  }

  if (del.nonce === undefined) {
    return { pass: false, message: 'delegatedAttestation missing "nonce"', details };
  }

  return { pass: true, message: 'Attestation structure valid', details };
}

/**
 * Assert an RFC 7807 error response.
 */
export function assertRfc7807Error(body, expectedStatus) {
  const details = { expectedStatus, actual: body };

  if (!body || !body.type) {
    return { pass: false, message: 'Response not an RFC 7807 error (missing "type")', details };
  }

  if (expectedStatus && body.status !== expectedStatus) {
    return { pass: false, message: `status ${body.status} !== expected ${expectedStatus}`, details };
  }

  if (!body.title) {
    return { pass: false, message: 'RFC 7807 error missing "title"', details };
  }

  return { pass: true, message: `RFC 7807 error with status ${body.status}`, details };
}

/**
 * Assert that a response has a specific HTTP status.
 */
export function assertStatus(response, expected) {
  const details = { expected, actual: response.status };

  if (response.status !== expected) {
    return { pass: false, message: `HTTP ${response.status} !== expected ${expected}`, details };
  }

  return { pass: true, message: `HTTP ${expected}`, details };
}

/**
 * Assert that a value equals expected.
 */
export function assertEqual(actual, expected, label = 'value') {
  if (actual === expected) {
    return { pass: true, message: `${label}: ${actual} === ${expected}`, details: { actual, expected } };
  }
  return { pass: false, message: `${label}: ${actual} !== ${expected}`, details: { actual, expected } };
}

/**
 * Assert that a value is truthy.
 */
export function assertTrue(value, label = 'value') {
  if (value) {
    return { pass: true, message: `${label} is truthy`, details: { value } };
  }
  return { pass: false, message: `${label} is falsy`, details: { value } };
}

/**
 * SDK integration test example: call Astral compute within() and assert result shape.
 * Run with: npx vitest run tests/sdk/within.example.test.ts
 * Skip when ASTRAL_API_URL or RESOLVER_SCHEMA_UID are not set (e.g. in CI without secrets).
 */

import { describe, it, expect } from 'vitest';
import { createAstralCompute } from '@decentralized-geo/astral-compute';

const apiUrl = process.env.ASTRAL_API_URL ?? '';
const chainId = Number(process.env.CHAIN_ID ?? 84532);
const schemaUid = process.env.RESOLVER_SCHEMA_UID ?? '';

const shouldRun = Boolean(apiUrl && schemaUid);
(shouldRun ? describe : describe.skip)('Astral SDK within()', () => {
  it('returns boolean result and delegated attestation', async () => {
    const astral = createAstralCompute({ apiUrl, chainId });
    const userPoint = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };
    const targetPoint = { type: 'Point' as const, coordinates: [-122.42, 37.775] };

    const result = await astral.within(userPoint, targetPoint, 5000, {
      schema: schemaUid,
      recipient: '0x0000000000000000000000000000000000000000',
    });

    expect(typeof result.result).toBe('boolean');
    expect(result.operation).toBe('within');
    expect(typeof result.timestamp).toBe('number');
    expect(Array.isArray(result.inputRefs)).toBe(true);
    expect(result.attestation).toBeDefined();
    expect(result.attestation.schema).toBe(schemaUid);
    expect(result.attestation.attester).toBeDefined();
    expect(result.delegatedAttestation).toBeDefined();
    expect(typeof result.delegatedAttestation.deadline).toBe('number');
  });
});

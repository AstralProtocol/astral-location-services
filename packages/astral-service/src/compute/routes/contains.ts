import { Router } from 'express';
import { computeContains } from '../db/spatial.js';
import { resolveInputs, extractProofMetadata } from '../services/input-resolver.js';
import { signBooleanAttestation } from '../../core/signing/attestation.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { ContainsRequestSchema } from '../validation/schemas.js';
import { getBooleanSchemaUid } from '../../core/config/schemas.js';
import type { BooleanComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/contains
 *
 * Check if the container geometry contains the containee geometry.
 * Returns a signed delegated attestation with the boolean result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = ContainsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { container, containee, schema: requestSchema, recipient, chainId } = parsed.data;

    // Get schema UID - use provided or fall back to configured default
    const schema = requestSchema ?? getBooleanSchemaUid(chainId);
    if (!schema) {
      throw Errors.invalidInput(
        'schema is required. Either provide a schema UID in the request or configure BOOLEAN_SCHEMA_UID environment variable.'
      );
    }

    const [containerResolved, containeeResolved] = await resolveInputs([container, containee], { chainId });
    const { proofInputs, refUID } = extractProofMetadata([containerResolved, containeeResolved]);

    const result = await computeContains(containerResolved.geometry, containeeResolved.geometry);
    const timestamp = Math.floor(Date.now() / 1000);

    const signingResult = await signBooleanAttestation(
      {
        result,
        inputRefs: [containerResolved.ref, containeeResolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'contains',
      },
      schema,
      recipient,
      refUID
    );

    const response: BooleanComputeResponse = {
      result,
      operation: 'contains',
      timestamp,
      inputRefs: [containerResolved.ref, containeeResolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
      ...(proofInputs.length > 0 ? { proofInputs } : {}),
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

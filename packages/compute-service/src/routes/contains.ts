import { Router } from 'express';
import { computeContains } from '../db/spatial.js';
import { resolveInputs } from '../services/input-resolver.js';
import { signBooleanAttestation } from '../signing/attestation.js';
import { Errors } from '../middleware/error-handler.js';
import { ContainsRequestSchema } from '../validation/schemas.js';
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

    const { container, containee, schema, recipient, chainId } = parsed.data;

    const [containerResolved, containeeResolved] = await resolveInputs([container, containee]);

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
      chainId
    );

    const response: BooleanComputeResponse = {
      result,
      operation: 'contains',
      timestamp,
      inputRefs: [containerResolved.ref, containeeResolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import { computeWithin } from '../db/spatial.js';
import { resolveInputs } from '../services/input-resolver.js';
import { signBooleanAttestation } from '../signing/attestation.js';
import { Errors } from '../middleware/error-handler.js';
import { WithinRequestSchema } from '../validation/schemas.js';
import type { BooleanComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/within
 *
 * Check if a geometry is within a given radius (meters) of a target geometry.
 * Returns a signed delegated attestation with the boolean result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = WithinRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { point, target, radius, schema, recipient } = parsed.data;

    const [pointResolved, targetResolved] = await resolveInputs([point, target]);

    const result = await computeWithin(pointResolved.geometry, targetResolved.geometry, radius);
    const timestamp = Math.floor(Date.now() / 1000);

    const signingResult = await signBooleanAttestation(
      {
        result,
        inputRefs: [pointResolved.ref, targetResolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'within',
      },
      schema,
      recipient
    );

    const response: BooleanComputeResponse = {
      result,
      operation: 'within',
      timestamp,
      inputRefs: [pointResolved.ref, targetResolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

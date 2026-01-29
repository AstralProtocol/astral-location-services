import { Router } from 'express';
import { computeIntersects } from '../db/spatial.js';
import { resolveInputs } from '../services/input-resolver.js';
import { signBooleanAttestation } from '../signing/attestation.js';
import { Errors } from '../middleware/error-handler.js';
import { IntersectsRequestSchema } from '../validation/schemas.js';
import type { BooleanComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/intersects
 *
 * Check if two geometries intersect.
 * Returns a signed delegated attestation with the boolean result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = IntersectsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { geometry1, geometry2, schema, recipient } = parsed.data;

    const [geom1Resolved, geom2Resolved] = await resolveInputs([geometry1, geometry2]);

    const result = await computeIntersects(geom1Resolved.geometry, geom2Resolved.geometry);
    const timestamp = Math.floor(Date.now() / 1000);

    const signingResult = await signBooleanAttestation(
      {
        result,
        inputRefs: [geom1Resolved.ref, geom2Resolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'intersects',
      },
      schema,
      recipient
    );

    const response: BooleanComputeResponse = {
      result,
      operation: 'intersects',
      timestamp,
      inputRefs: [geom1Resolved.ref, geom2Resolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

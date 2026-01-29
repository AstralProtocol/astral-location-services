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

    const { geometry, target, radius, schema, recipient } = parsed.data;

    const [geometryResolved, targetResolved] = await resolveInputs([geometry, target]);

    const result = await computeWithin(geometryResolved.geometry, targetResolved.geometry, radius);
    const timestamp = Math.floor(Date.now() / 1000);

    // Encode radius in centimeters in the operation string for attestation verification
    // This ensures the radius parameter is included in the signed attestation data
    const radiusCm = Math.round(radius * 100);
    const operationWithRadius = `within:${radiusCm}`;

    const signingResult = await signBooleanAttestation(
      {
        result,
        inputRefs: [geometryResolved.ref, targetResolved.ref],
        timestamp: BigInt(timestamp),
        operation: operationWithRadius,
      },
      schema,
      recipient
    );

    const response: BooleanComputeResponse = {
      result,
      operation: operationWithRadius,
      timestamp,
      inputRefs: [geometryResolved.ref, targetResolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import { computeDistance } from '../db/spatial.js';
import { resolveInputs, extractProofMetadata } from '../services/input-resolver.js';
import { signNumericAttestation } from '../../core/signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../../core/signing/schemas.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { DistanceRequestSchema } from '../validation/schemas.js';
import { getNumericSchemaUid } from '../../core/config/schemas.js';
import type { NumericComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/distance
 *
 * Compute the distance between two geometries.
 * Returns a signed delegated attestation with the result.
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate request
    const parsed = DistanceRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { from, to, schema: requestSchema, recipient, chainId } = parsed.data;

    // Get schema UID - use provided or fall back to configured default
    const schema = requestSchema ?? getNumericSchemaUid(chainId);
    if (!schema) {
      throw Errors.invalidInput(
        'schema is required. Either provide a schema UID in the request or configure NUMERIC_SCHEMA_UID environment variable.'
      );
    }

    // Resolve inputs to geometries
    const [fromResolved, toResolved] = await resolveInputs([from, to], { chainId });
    const { proofInputs, refUID } = extractProofMetadata([fromResolved, toResolved]);

    // Compute distance via PostGIS
    const distanceMeters = await computeDistance(fromResolved.geometry, toResolved.geometry);

    // Scale to centimeters for uint256
    const scaledResult = scaleToUint256(distanceMeters, SCALE_FACTORS.DISTANCE);
    const timestamp = Math.floor(Date.now() / 1000);

    // Sign attestation
    const signingResult = await signNumericAttestation(
      {
        result: scaledResult,
        units: UNITS.CENTIMETERS,
        inputRefs: [fromResolved.ref, toResolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'distance',
      },
      schema,
      recipient,
      refUID
    );

    const response: NumericComputeResponse = {
      result: distanceMeters,
      units: 'meters',
      operation: 'distance',
      timestamp,
      inputRefs: [fromResolved.ref, toResolved.ref],
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

import { Router } from 'express';
import { computeLength } from '../db/spatial.js';
import { resolveInput, extractProofMetadata } from '../services/input-resolver.js';
import { signNumericAttestation } from '../../core/signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../../core/signing/schemas.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { LengthRequestSchema } from '../validation/schemas.js';
import { getNumericSchemaUid } from '../../core/config/schemas.js';
import type { NumericComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/length
 *
 * Compute the length of a line geometry.
 * Returns a signed delegated attestation with the result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = LengthRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { geometry, schema: requestSchema, recipient, chainId } = parsed.data;

    // Get schema UID - use provided or fall back to configured default
    const schema = requestSchema ?? getNumericSchemaUid(chainId);
    if (!schema) {
      throw Errors.invalidInput(
        'schema is required. Either provide a schema UID in the request or configure NUMERIC_SCHEMA_UID environment variable.'
      );
    }

    const resolved = await resolveInput(geometry, { chainId });
    const { proofInputs, refUID } = extractProofMetadata([resolved]);

    // Validate geometry type
    if (!['LineString', 'MultiLineString'].includes(resolved.geometry.type)) {
      throw Errors.invalidInput('Length computation requires a LineString or MultiLineString geometry');
    }

    const lengthMeters = await computeLength(resolved.geometry);

    // Scale to centimeters for uint256
    const scaledResult = scaleToUint256(lengthMeters, SCALE_FACTORS.LENGTH);
    const timestamp = Math.floor(Date.now() / 1000);

    const signingResult = await signNumericAttestation(
      {
        result: scaledResult,
        units: UNITS.CENTIMETERS,
        inputRefs: [resolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'length',
      },
      schema,
      recipient,
      refUID
    );

    const response: NumericComputeResponse = {
      result: lengthMeters,
      units: 'meters',
      operation: 'length',
      timestamp,
      inputRefs: [resolved.ref],
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

import { Router } from 'express';
import { computeArea } from '../db/spatial.js';
import { resolveInput, extractProofMetadata } from '../services/input-resolver.js';
import { signNumericAttestation } from '../../core/signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../../core/signing/schemas.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { AreaRequestSchema } from '../validation/schemas.js';
import { getNumericSchemaUid } from '../../core/config/schemas.js';
import type { NumericComputeResponse } from '../types/index.js';

const router = Router();

/**
 * POST /compute/area
 *
 * Compute the area of a polygon geometry.
 * Returns a signed delegated attestation with the result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = AreaRequestSchema.safeParse(req.body);
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
    if (!['Polygon', 'MultiPolygon'].includes(resolved.geometry.type)) {
      throw Errors.invalidInput('Area computation requires a Polygon or MultiPolygon geometry');
    }

    const areaSquareMeters = await computeArea(resolved.geometry);

    // Scale to square centimeters for uint256
    const scaledResult = scaleToUint256(areaSquareMeters, SCALE_FACTORS.AREA);
    const timestamp = Math.floor(Date.now() / 1000);

    const signingResult = await signNumericAttestation(
      {
        result: scaledResult,
        units: UNITS.SQUARE_CENTIMETERS,
        inputRefs: [resolved.ref],
        timestamp: BigInt(timestamp),
        operation: 'area',
      },
      schema,
      recipient,
      refUID
    );

    const response: NumericComputeResponse = {
      result: areaSquareMeters,
      units: 'square_meters',
      operation: 'area',
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

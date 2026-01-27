import { Router } from 'express';
import { z } from 'zod';
import { computeArea } from '../db/spatial.js';
import { resolveInput } from '../services/input-resolver.js';
import { signNumericAttestation } from '../signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../signing/schemas.js';
import { Errors } from '../middleware/error-handler.js';
import type { ComputeResponse } from '../types/index.js';
import { toSerializableAttestation } from '../types/index.js';

const router = Router();

const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']),
  coordinates: z.any(),
}).passthrough();

const InputSchema = z.union([
  GeometrySchema,
  z.object({ uid: z.string() }),
  z.object({ uid: z.string(), uri: z.string().url() }),
]);

const AreaRequestSchema = z.object({
  geometry: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
});

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

    const { geometry, schema, recipient } = parsed.data;

    const resolved = await resolveInput(geometry);

    // Validate geometry type
    if (!['Polygon', 'MultiPolygon'].includes(resolved.geometry.type)) {
      throw Errors.invalidInput('Area computation requires a Polygon or MultiPolygon geometry');
    }

    const areaSquareMeters = await computeArea(resolved.geometry);

    // Scale to square centimeters for uint256
    const scaledResult = scaleToUint256(areaSquareMeters, SCALE_FACTORS.AREA);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestation = await signNumericAttestation(
      {
        result: scaledResult,
        units: UNITS.SQUARE_CENTIMETERS,
        inputRefs: [resolved.ref],
        timestamp,
        operation: 'area',
      },
      schema,
      recipient
    );

    const response: ComputeResponse = {
      attestation: toSerializableAttestation(attestation),
      result: {
        value: areaSquareMeters,
        units: 'square_meters',
      },
      inputs: {
        refs: [resolved.ref],
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

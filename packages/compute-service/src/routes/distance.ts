import { Router } from 'express';
import { z } from 'zod';
import { computeDistance } from '../db/spatial.js';
import { resolveInputs } from '../services/input-resolver.js';
import { signNumericAttestation } from '../signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../signing/schemas.js';
import { Errors } from '../middleware/error-handler.js';
import type { ComputeResponse } from '../types/index.js';
import { toSerializableAttestation } from '../types/index.js';

const router = Router();

// GeoJSON Geometry schema
const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']),
  coordinates: z.any(),
}).passthrough();

// Input can be raw GeoJSON (for MVP) or UID references (Phase 2)
const InputSchema = z.union([
  GeometrySchema,
  z.object({ uid: z.string() }),
  z.object({ uid: z.string(), uri: z.string().url() }),
]);

const DistanceRequestSchema = z.object({
  from: InputSchema,
  to: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
});

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

    const { from, to, schema, recipient } = parsed.data;

    // Resolve inputs to geometries
    const [fromResolved, toResolved] = await resolveInputs([from, to]);

    // Compute distance via PostGIS
    const distanceMeters = await computeDistance(fromResolved.geometry, toResolved.geometry);

    // Scale to centimeters for uint256
    const scaledResult = scaleToUint256(distanceMeters, SCALE_FACTORS.DISTANCE);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    // Sign attestation
    const attestation = await signNumericAttestation(
      {
        result: scaledResult,
        units: UNITS.CENTIMETERS,
        inputRefs: [fromResolved.ref, toResolved.ref],
        timestamp,
        operation: 'distance',
      },
      schema,
      recipient
    );

    const response: ComputeResponse = {
      attestation: toSerializableAttestation(attestation),
      result: {
        value: distanceMeters,
        units: 'meters',
      },
      inputs: {
        refs: [fromResolved.ref, toResolved.ref],
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

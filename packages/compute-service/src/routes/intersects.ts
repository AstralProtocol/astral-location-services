import { Router } from 'express';
import { z } from 'zod';
import { computeIntersects } from '../db/spatial.js';
import { resolveInputs } from '../services/input-resolver.js';
import { signBooleanAttestation } from '../signing/attestation.js';
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

const IntersectsRequestSchema = z.object({
  geometry1: InputSchema,
  geometry2: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
});

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
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestation = await signBooleanAttestation(
      {
        result,
        inputRefs: [geom1Resolved.ref, geom2Resolved.ref],
        timestamp,
        operation: 'intersects',
      },
      schema,
      recipient
    );

    const response: ComputeResponse = {
      attestation: toSerializableAttestation(attestation),
      result: {
        value: result ? 1 : 0,
        units: 'boolean',
      },
      inputs: {
        refs: [geom1Resolved.ref, geom2Resolved.ref],
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

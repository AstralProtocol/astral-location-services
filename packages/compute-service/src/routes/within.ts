import { Router } from 'express';
import { z } from 'zod';
import { computeWithin } from '../db/spatial.js';
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

const WithinRequestSchema = z.object({
  point: InputSchema,
  target: InputSchema,
  radius: z.number().positive('Radius must be positive'),
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
});

/**
 * POST /compute/within
 *
 * Check if a point is within a given radius (meters) of a target geometry.
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
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestation = await signBooleanAttestation(
      {
        result,
        inputRefs: [pointResolved.ref, targetResolved.ref],
        timestamp,
        operation: 'within',
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
        refs: [pointResolved.ref, targetResolved.ref],
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

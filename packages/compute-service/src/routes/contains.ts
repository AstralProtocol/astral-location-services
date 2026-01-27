import { Router } from 'express';
import { z } from 'zod';
import { computeContains } from '../db/spatial.js';
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

const ContainsRequestSchema = z.object({
  container: InputSchema,
  containee: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
});

/**
 * POST /compute/contains
 *
 * Check if the container geometry contains the containee geometry.
 * Returns a signed delegated attestation with the boolean result.
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = ContainsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { container, containee, schema, recipient } = parsed.data;

    const [containerResolved, containeeResolved] = await resolveInputs([container, containee]);

    const result = await computeContains(containerResolved.geometry, containeeResolved.geometry);
    const timestamp = BigInt(Math.floor(Date.now() / 1000));

    const attestation = await signBooleanAttestation(
      {
        result,
        inputRefs: [containerResolved.ref, containeeResolved.ref],
        timestamp,
        operation: 'contains',
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
        refs: [containerResolved.ref, containeeResolved.ref],
      },
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

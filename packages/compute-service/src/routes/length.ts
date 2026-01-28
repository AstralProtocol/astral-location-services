import { Router } from 'express';
import { z } from 'zod';
import { computeLength } from '../db/spatial.js';
import { resolveInput } from '../services/input-resolver.js';
import { signNumericAttestation } from '../signing/attestation.js';
import { UNITS, SCALE_FACTORS, scaleToUint256 } from '../signing/schemas.js';
import { Errors } from '../middleware/error-handler.js';
import type { NumericComputeResponse } from '../types/index.js';

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

const LengthRequestSchema = z.object({
  chainId: z.number().int().positive('chainId must be a positive integer'),
  geometry: InputSchema,
  schema: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID'),
  recipient: z.string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address')
    .optional()
    .default('0x0000000000000000000000000000000000000000'),
});

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

    const { geometry, schema, recipient } = parsed.data;

    const resolved = await resolveInput(geometry);

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
      recipient
    );

    const response: NumericComputeResponse = {
      result: lengthMeters,
      units: 'meters',
      operation: 'length',
      timestamp,
      inputRefs: [resolved.ref],
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

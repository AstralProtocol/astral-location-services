import { Router } from 'express';
import { verifyStamp } from '../index.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { VerifyStampRequestSchema } from '../validation/schemas.js';
import type { VerifyStampResponse } from '../types/index.js';

const router = Router();

/**
 * POST /verify/v0/stamp
 *
 * Verify a stamp's internal validity (no claim assessment).
 *
 * This endpoint checks:
 * - Signature validity
 * - Structure validity
 * - Signal consistency
 *
 * It does NOT evaluate the stamp against a claim.
 * Use POST /verify/v0/proof for full verification with claim assessment.
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate request
    const parsed = VerifyStampRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { stamp } = parsed.data;

    // Verify stamp
    const result = await verifyStamp(stamp);

    const response: VerifyStampResponse = {
      valid: result.valid,
      signaturesValid: result.signaturesValid,
      structureValid: result.structureValid,
      signalsConsistent: result.signalsConsistent,
      details: result.details,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

/**
 * GeoClue Plugin
 *
 * Linux GeoClue2 D-Bus location service verification.
 * Stamps contain lat/lon/accuracy from the system location daemon.
 *
 * MVP: Validates structure, signals, and signature format.
 * Future: Cross-reference GeoClue source type with expected accuracy.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, StampEvaluation } from '../interface.js';
import { verifyGeoclueStamp, evaluateGeoclueStamp } from './verify.js';

export class GeocluePlugin implements LocationProofPlugin {
  readonly name = 'geoclue';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'Linux GeoClue2 D-Bus system location service';

  /**
   * Verify a GeoClue stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyGeoclueStamp(stamp);
  }

  /**
   * Evaluate how well a GeoClue stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation> {
    return evaluateGeoclueStamp(stamp, claim);
  }
}

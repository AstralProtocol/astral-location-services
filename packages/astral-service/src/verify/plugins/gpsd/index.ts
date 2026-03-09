/**
 * GPSD Plugin
 *
 * GPS hardware verification via gpspipe/NMEA data.
 * Stamps contain fix quality, satellite count, and position data.
 *
 * MVP: Validates structure, signals, and signature format.
 * Future: GPS signal replay detection, ephemeris cross-check.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, StampEvaluation } from '../interface.js';
import { verifyGpsdStamp, evaluateGpsdStamp } from './verify.js';

export class GpsdPlugin implements LocationProofPlugin {
  readonly name = 'gpsd';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'GPS hardware location via gpspipe NMEA data';

  /**
   * Verify a GPSD stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyGpsdStamp(stamp);
  }

  /**
   * Evaluate how well a GPSD stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation> {
    return evaluateGpsdStamp(stamp, claim);
  }
}

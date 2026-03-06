/**
 * WiFi MLS Plugin
 *
 * WiFi AP scan + Mozilla Location Service verification.
 * Stamps contain scanned access points and MLS geolocation response.
 *
 * MVP: Validates structure, signals, and signature format.
 * Future: AP MAC address spoofing detection, MLS response freshness.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, StampEvaluation } from '../interface.js';
import { verifyWifiMlsStamp, evaluateWifiMlsStamp } from './verify.js';

export class WifiMlsPlugin implements LocationProofPlugin {
  readonly name = 'wifi-mls';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'WiFi AP scan with Mozilla Location Service geolocation';

  /**
   * Verify a WiFi MLS stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyWifiMlsStamp(stamp);
  }

  /**
   * Evaluate how well a WiFi MLS stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation> {
    return evaluateWifiMlsStamp(stamp, claim);
  }
}

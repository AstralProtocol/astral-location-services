/**
 * IP Geolocation Plugin
 *
 * Public IP geolocation via ipinfo.io or similar providers.
 * Stamps contain IP address and provider geolocation response.
 *
 * MVP: Validates structure, signals, and signature format.
 * Future: VPN/proxy/tunnel detection, multi-provider cross-reference.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, StampEvaluation } from '../interface.js';
import { verifyIpGeolocationStamp, evaluateIpGeolocationStamp } from './verify.js';

export class IpGeolocationPlugin implements LocationProofPlugin {
  readonly name = 'ip-geolocation';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'IP-based geolocation via public lookup services';

  /**
   * Verify an IP geolocation stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyIpGeolocationStamp(stamp);
  }

  /**
   * Evaluate how well an IP geolocation stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation> {
    return evaluateIpGeolocationStamp(stamp, claim);
  }
}

/**
 * RTT-Anchor Plugin (Service-Side)
 *
 * Round-trip-time location evidence from plugin-rtt-anchor: an anchor at
 * known coordinates challenges the attester and signs the measured RTT,
 * bounding how far the attester's key can be from the anchor. This plugin
 * fills the verifier role that the upstream repo deliberately leaves out —
 * it validates the anchor-signed bytes and re-derives every reading from
 * them rather than trusting the attester's summary.
 *
 * The upstream repo is unstable; the signals contract is vendored and
 * pinned to UPSTREAM_COMMIT in schema.ts.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, StampEvaluation } from '../interface.js';
import {
  verifyRttAnchorStamp,
  evaluateRttAnchorStamp,
  type TrustedAnchorRegistry,
} from './verify.js';

export { UPSTREAM_COMMIT } from './schema.js';
export type { TrustedAnchorRegistry } from './verify.js';

export class RttAnchorPlugin implements LocationProofPlugin {
  readonly name = 'rtt-anchor';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'RTT distance-bound evidence from anchor-signed latency measurements';

  private readonly trustedAnchors?: TrustedAnchorRegistry;

  constructor(options?: { trustedAnchors?: TrustedAnchorRegistry }) {
    this.trustedAnchors = options?.trustedAnchors;
  }

  /**
   * Verify an RTT-anchor stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyRttAnchorStamp(stamp, this.trustedAnchors);
  }

  /**
   * Evaluate how well an RTT-anchor stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<StampEvaluation> {
    return evaluateRttAnchorStamp(stamp, claim);
  }
}

/**
 * WitnessChain Plugin (Service-Side)
 *
 * Infrastructure proof-of-location via network latency triangulation.
 * Verifies ECDSA signatures on challenge results and evaluates
 * location claims against multi-source evidence.
 *
 * This is a service-side adapter that delegates to the WitnessChain
 * plugin package for verification and evaluation logic.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, CredibilityVector } from '../interface.js';
import {
  verifyWitnessChainStamp,
  evaluateWitnessChainStamp,
} from './verify.js';

export class WitnessChainPlugin implements LocationProofPlugin {
  readonly name = 'witnesschain';
  readonly version = '0.1.0';
  readonly environments = ['server', 'node'];
  readonly description = 'WitnessChain proof-of-location via network latency triangulation';

  /**
   * Verify a WitnessChain stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyWitnessChainStamp(stamp);
  }

  /**
   * Evaluate how well a WitnessChain stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<CredibilityVector> {
    return evaluateWitnessChainStamp(stamp, claim);
  }
}

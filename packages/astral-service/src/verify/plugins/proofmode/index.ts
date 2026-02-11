/**
 * ProofMode Plugin
 *
 * Device-based location attestation verification.
 * Uses hardware attestation (Secure Enclave/TEE) and sensor fusion.
 *
 * MVP: Validates structure and signatures, evaluates against claims.
 * Future: Full device attestation verification with SafetyNet/DeviceCheck.
 */

import type { LocationStamp, LocationClaim, StampVerificationResult } from '../../types/index.js';
import type { LocationProofPlugin, CredibilityVector } from '../interface.js';
import { verifyProofModeStamp, evaluateProofModeStamp } from './verify.js';

export class ProofModePlugin implements LocationProofPlugin {
  readonly name = 'proofmode';
  readonly version = '0.1.0';
  readonly environments = ['mobile', 'server'];
  readonly description = 'Device-based location attestation with hardware attestation';

  /**
   * Verify a ProofMode stamp's internal validity.
   */
  async verify(stamp: LocationStamp): Promise<StampVerificationResult> {
    return verifyProofModeStamp(stamp);
  }

  /**
   * Evaluate how well a ProofMode stamp supports a claim.
   */
  async evaluate(stamp: LocationStamp, claim: LocationClaim): Promise<CredibilityVector> {
    return evaluateProofModeStamp(stamp, claim);
  }
}

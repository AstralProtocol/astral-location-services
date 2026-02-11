import { Router } from 'express';
import { keccak256, toUtf8Bytes } from 'ethers';
import { verifyProof } from '../index.js';
import { signVerifyAttestation, getSignerAddress } from '../../core/signing/attestation.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { VerifyProofRequestSchema } from '../validation/schemas.js';
import { getVerifySchemaUid } from '../../core/config/schemas.js';
import type { VerifyProofResponse, VerifyAttestationData } from '../types/index.js';
import { scaleConfidenceToUint8 } from '../assessment.js';

const router = Router();

/**
 * POST /verify/v0/proof
 *
 * Verify a location proof (claim + stamps) and return a credibility assessment.
 *
 * This endpoint:
 * 1. Verifies each stamp's internal validity
 * 2. Evaluates each stamp against the claim
 * 3. Analyzes cross-correlation (for multi-stamp proofs)
 * 4. Computes overall credibility
 * 5. Signs an EAS attestation
 */
router.post('/', async (req, res, next) => {
  try {
    // Validate request
    const parsed = VerifyProofRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw Errors.invalidInput(parsed.error.message);
    }

    const { proof, options } = parsed.data;
    const chainId = options?.chainId ?? 84532; // Default to Base Sepolia

    // Get schema UID
    const schema = options?.schema ?? getVerifySchemaUid(chainId);
    if (!schema) {
      throw Errors.invalidInput(
        'schema is required. Either provide a schema UID in options or configure VERIFY_SCHEMA_UID environment variable.'
      );
    }

    const recipient = options?.recipient ?? '0x0000000000000000000000000000000000000000';

    // Verify the proof
    const credibility = await verifyProof(proof);

    // Generate hashes for attestation
    const claimHash = keccak256(toUtf8Bytes(JSON.stringify(proof.claim)));
    const proofHash = keccak256(toUtf8Bytes(JSON.stringify(proof)));

    // Create attestation data
    const attestationData: VerifyAttestationData = {
      claimHash,
      proofHash,
      confidence: scaleConfidenceToUint8(credibility.confidence),
      credibilityUri: '', // MVP: Empty, future: IPFS URI
    };

    // Sign attestation
    const signingResult = await signVerifyAttestation(attestationData, schema, recipient);

    const timestamp = Math.floor(Date.now() / 1000);

    // Generate a unique ID for this verification result
    const uid = keccak256(toUtf8Bytes(`${proofHash}:${timestamp}`));

    const response: VerifyProofResponse = {
      uid,
      credibility,
      proof,
      attestation: signingResult.attestation,
      delegatedAttestation: signingResult.delegatedAttestation,
      attester: getSignerAddress(),
      timestamp,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

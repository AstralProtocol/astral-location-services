import { Router } from 'express';
import { keccak256, toUtf8Bytes } from 'ethers';
import { verifyProof } from '../index.js';
import { toBasisPoints } from '../assessment.js';
import { signVerifyAttestation, getSignerAddress } from '../../core/signing/attestation.js';
import { Errors } from '../../core/middleware/error-handler.js';
import { VerifyProofRequestSchema } from '../validation/schemas.js';
import { getVerifySchemaUid } from '../../core/config/schemas.js';
import type { VerifiedLocationProofResponse, VerifyAttestationData } from '../types/index.js';

const router = Router();

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * POST /verify/v0/proof
 *
 * Verify a location proof (claim + stamps) and return a VerifiedLocationProof.
 *
 * This endpoint:
 * 1. Verifies each stamp's internal validity
 * 2. Evaluates each stamp against the claim (raw measurements)
 * 3. Aggregates into CredibilityVector dimensions
 * 4. Signs an EAS attestation encoding the dimensions
 * 5. Returns SDK-compatible VerifiedLocationProof response
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

    // Verify the proof → CredibilityVector
    const credibility = await verifyProof(proof);

    const timestamp = Math.floor(Date.now() / 1000);
    const proofHash = keccak256(toUtf8Bytes(JSON.stringify(proof)));
    const uid = keccak256(toUtf8Bytes(`${proofHash}:${timestamp}`));

    const { dimensions } = credibility;

    // Encode dimensions as attestation data (basis points for fractions)
    const attestationData: VerifyAttestationData = {
      proofHash,
      meanDistanceMeters: Math.round(dimensions.spatial.meanDistanceMeters),
      maxDistanceMeters: Math.round(dimensions.spatial.maxDistanceMeters),
      withinRadiusBp: toBasisPoints(dimensions.spatial.withinRadiusFraction),
      meanOverlapBp: toBasisPoints(dimensions.temporal.meanOverlap),
      minOverlapBp: toBasisPoints(dimensions.temporal.minOverlap),
      signaturesValidBp: toBasisPoints(dimensions.validity.signaturesValidFraction),
      structureValidBp: toBasisPoints(dimensions.validity.structureValidFraction),
      signalsConsistentBp: toBasisPoints(dimensions.validity.signalsConsistentFraction),
      uniquePluginRatioBp: toBasisPoints(dimensions.independence.uniquePluginRatio),
      stampCount: credibility.meta.stampCount,
    };

    // Sign attestation
    const signingResult = await signVerifyAttestation(attestationData, schema, recipient);

    const response: VerifiedLocationProofResponse = {
      proof,
      credibility,
      attestation: {
        uid,
        schema,
        attester: getSignerAddress(),
        recipient,
        revocable: true,
        refUID: ZERO_BYTES32,
        data: signingResult.attestation.data,
        time: timestamp,
        expirationTime: 0,
        revocationTime: 0,
        signature: signingResult.attestation.signature,
      },
      delegatedAttestation: signingResult.delegatedAttestation,
      chainId,
      evaluationMethod: 'astral-v0.3.0-tee',
      evaluatedAt: timestamp,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

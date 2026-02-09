/**
 * EIP-712 signature verification for Astral attestations.
 * Uses ethers@6 — works in both Node.js and browser.
 */
import { verifyTypedData } from 'ethers';

// EAS contract addresses per chain
const EAS_CONTRACTS = {
  84532: '0x4200000000000000000000000000000000000021', // Base Sepolia
  8453: '0x4200000000000000000000000000000000000021',  // Base Mainnet
};

/**
 * Build the EAS EIP-712 domain for a given chain.
 */
export function createDomainForChain(chainId) {
  return {
    name: 'EAS',
    version: '1.2.0',
    chainId,
    verifyingContract: EAS_CONTRACTS[chainId] || EAS_CONTRACTS[84532],
  };
}

/** EIP-712 type definitions for EAS Attest */
export const EAS_ATTEST_TYPES = {
  Attest: [
    { name: 'schema', type: 'bytes32' },
    { name: 'recipient', type: 'address' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'revocable', type: 'bool' },
    { name: 'refUID', type: 'bytes32' },
    { name: 'data', type: 'bytes' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint64' },
  ],
};

const ZERO_REF_UID = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Reconstruct the EIP-712 message from an API response.
 */
export function reconstructMessage(response) {
  const { attestation, delegatedAttestation } = response;
  return {
    schema: attestation.schema,
    recipient: attestation.recipient,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO_REF_UID,
    data: attestation.data,
    value: 0n,
    nonce: BigInt(delegatedAttestation.nonce),
    deadline: BigInt(delegatedAttestation.deadline),
  };
}

/**
 * Verify a signature from an API response.
 * Returns the recovered signer address.
 * @param {object} response - API response with attestation + delegatedAttestation
 * @param {number} [chainId=84532] - Chain ID
 * @returns {string} Recovered signer address
 */
export function verifySignature(response, chainId = 84532) {
  const domain = createDomainForChain(chainId);
  const message = reconstructMessage(response);
  return verifyTypedData(domain, EAS_ATTEST_TYPES, message, response.attestation.signature);
}

/**
 * Verify that a signature recovers to the expected attester.
 * Returns { pass, message, details }.
 */
export function assertValidSignature(response, chainId = 84532) {
  const { delegatedAttestation } = response;
  const expectedAttester = delegatedAttestation.attester;

  try {
    const recovered = verifySignature(response, chainId);
    const match = recovered.toLowerCase() === expectedAttester.toLowerCase();

    return {
      pass: match,
      message: match
        ? `Signature valid: recovered ${recovered}`
        : `Signature mismatch: expected ${expectedAttester}, got ${recovered}`,
      details: { recovered, expected: expectedAttester, chainId },
    };
  } catch (err) {
    return {
      pass: false,
      message: `Signature verification error: ${err.message}`,
      details: { error: err.message, chainId },
    };
  }
}

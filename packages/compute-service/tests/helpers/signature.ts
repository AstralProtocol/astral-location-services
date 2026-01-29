/**
 * Shared helpers for EIP-712 signature verification in tests.
 */
import { verifyTypedData } from 'ethers';

// EAS domain for signature verification - must match what the service uses
export const EAS_DOMAIN = {
  name: 'EAS',
  version: '1.0.0',
  chainId: 84532, // Base Sepolia
  verifyingContract: '0x4200000000000000000000000000000000000021',
};

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

/**
 * Hardhat/Anvil default account #0 address.
 *
 * Derived from the standard test mnemonic:
 *   "test test test test test test test test test test test junk"
 *
 * This is the address corresponding to TEST_PRIVATE_KEY in test-server.ts.
 * See: https://hardhat.org/hardhat-network/docs/reference#initial-state
 */
export const TEST_ATTESTER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Zero refUID used in all attestations
export const ZERO_REF_UID = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Response shape from compute API (subset needed for verification).
 */
export interface ComputeResponse {
  attestation: {
    schema: string;
    recipient: string;
    data: string;
    signature: string;
  };
  delegatedAttestation: {
    nonce: number;
    deadline: number;
  };
}

/**
 * Reconstruct the EIP-712 message from an API response.
 * This must match exactly what the service signs in signing/attestation.ts
 */
export function reconstructMessage(response: ComputeResponse) {
  const { attestation, delegatedAttestation } = response;

  return {
    schema: attestation.schema,
    recipient: attestation.recipient,
    expirationTime: 0n, // No expiration
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
 * Reconstructs the EIP-712 message and recovers the signer address.
 *
 * @param response - The API response containing attestation and delegatedAttestation
 * @returns The recovered signer address
 */
export function verifySignature(response: ComputeResponse): string {
  const message = reconstructMessage(response);
  return verifyTypedData(EAS_DOMAIN, EAS_ATTEST_TYPES, message, response.attestation.signature);
}

/**
 * Verify that a signature recovers to the expected attester.
 * Throws if verification fails.
 *
 * @param response - The API response
 * @param expectedAttester - Expected signer address (defaults to TEST_ATTESTER)
 */
export function assertValidSignature(
  response: ComputeResponse,
  expectedAttester: string = TEST_ATTESTER
): void {
  const recovered = verifySignature(response);
  if (recovered.toLowerCase() !== expectedAttester.toLowerCase()) {
    throw new Error(
      `Signature verification failed: expected ${expectedAttester}, got ${recovered}`
    );
  }
}

import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { Wallet, HDNodeWallet } from 'ethers';
import { Mutex } from 'async-mutex';
import type { SigningResult, NumericPolicyAttestationData, BooleanPolicyAttestationData } from '../types/index.js';
import { NUMERIC_POLICY_SCHEMA, BOOLEAN_POLICY_SCHEMA } from './schemas.js';

// EAS contract addresses by chain
const EAS_CONTRACT_ADDRESSES: Record<number, string> = {
  84532: '0x4200000000000000000000000000000000000021', // Base Sepolia
  8453: '0x4200000000000000000000000000000000000021',  // Base Mainnet
};

// Domain separator constants
const EAS_DOMAIN_NAME = 'EAS';
const EAS_DOMAIN_VERSION = '1.2.0'; // Must match deployed EAS contract version

let signer: Wallet | HDNodeWallet | null = null;
let currentChainId = 84532; // Default to Base Sepolia
let nonce = 0n;
const nonceMutex = new Mutex();

// Cache for SchemaEncoder instances to avoid recreation per request
const encoderCache = new Map<string, SchemaEncoder>();

function getEncoder(schema: string): SchemaEncoder {
  let encoder = encoderCache.get(schema);
  if (!encoder) {
    encoder = new SchemaEncoder(schema);
    encoderCache.set(schema, encoder);
  }
  return encoder;
}

/**
 * Get the next nonce in a thread-safe manner.
 */
async function getNextNonce(): Promise<bigint> {
  return nonceMutex.runExclusive(() => nonce++);
}

/**
 * Initialize the signing service with a private key.
 * Optionally set the starting nonce (useful for syncing with contract state).
 */
export function initSigner(privateKey: string, chainId: number = 84532, startingNonce: bigint = 0n): void {
  signer = new Wallet(privateKey);
  currentChainId = chainId;
  nonce = startingNonce;
  console.log('Attestation signer initialized:', signer.address, 'nonce:', nonce.toString());
}

/**
 * Initialize the signing service from a mnemonic phrase.
 * Used in EigenCompute TEE environment where mnemonic is securely stored.
 */
export function initSignerFromMnemonic(mnemonic: string, chainId: number = 84532, startingNonce: bigint = 0n): void {
  signer = Wallet.fromPhrase(mnemonic);
  currentChainId = chainId;
  nonce = startingNonce;
  console.log('Attestation signer initialized from mnemonic:', signer.address, 'nonce:', nonce.toString());
}

/**
 * Set the nonce to a specific value.
 * Used for syncing with contract state or testing.
 */
export function setNonce(newNonce: bigint): void {
  nonce = newNonce;
}

/**
 * Get the current signer address.
 */
export function getSignerAddress(): string {
  if (!signer) {
    throw new Error('Signer not initialized');
  }
  return signer.address;
}

/**
 * Sign a numeric policy attestation (for distance, area, length operations).
 */
export async function signNumericAttestation(
  data: NumericPolicyAttestationData,
  schemaUid: string,
  recipient: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const encoder = getEncoder(NUMERIC_POLICY_SCHEMA);
  const encodedData = encoder.encodeData([
    { name: 'result', value: data.result, type: 'uint256' },
    { name: 'units', value: data.units, type: 'string' },
    { name: 'inputRefs', value: data.inputRefs, type: 'bytes32[]' },
    { name: 'timestamp', value: data.timestamp, type: 'uint256' },
    { name: 'operation', value: data.operation, type: 'string' },
  ]);

  return signDelegatedAttestation(encodedData, schemaUid, recipient);
}

/**
 * Sign a boolean policy attestation (for contains, within, intersects operations).
 */
export async function signBooleanAttestation(
  data: BooleanPolicyAttestationData,
  schemaUid: string,
  recipient: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const encoder = getEncoder(BOOLEAN_POLICY_SCHEMA);
  const encodedData = encoder.encodeData([
    { name: 'result', value: data.result, type: 'bool' },
    { name: 'inputRefs', value: data.inputRefs, type: 'bytes32[]' },
    { name: 'timestamp', value: data.timestamp, type: 'uint256' },
    { name: 'operation', value: data.operation, type: 'string' },
  ]);

  return signDelegatedAttestation(encodedData, schemaUid, recipient);
}

/**
 * Create and sign a delegated attestation.
 * Returns split attestation and delegatedAttestation objects.
 */
async function signDelegatedAttestation(
  encodedData: string,
  schemaUid: string,
  recipient: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const currentNonce = await getNextNonce();
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const deadline = BigInt(deadlineTimestamp);

  const message = {
    schema: schemaUid,
    recipient,
    expirationTime: 0n, // No expiration
    revocable: true,
    refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
    data: encodedData,
    value: 0n,
    nonce: currentNonce,
    deadline,
  };

  // Build EIP-712 typed data
  const domain = {
    name: EAS_DOMAIN_NAME,
    version: EAS_DOMAIN_VERSION,
    chainId: currentChainId,
    verifyingContract: EAS_CONTRACT_ADDRESSES[currentChainId],
  };

  const types = {
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

  // Sign the typed data - returns combined signature as hex string
  const signature = await signer.signTypedData(domain, types, message);

  return {
    attestation: {
      schema: schemaUid,
      attester: signer.address,
      recipient,
      data: encodedData,
      signature, // Combined signature as hex string (r + s + v)
    },
    delegatedAttestation: {
      signature, // Same signature, combined hex
      attester: signer.address,
      deadline: deadlineTimestamp, // Unix timestamp as number
      nonce: Number(currentNonce), // Nonce for verification & submission
    },
  };
}

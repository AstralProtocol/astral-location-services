import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { Wallet, keccak256, AbiCoder } from 'ethers';
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
const EAS_DOMAIN_VERSION = '1.0.0';
const ATTEST_TYPE_HASH = keccak256(
  Buffer.from('Attest(bytes32 schema,address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value,uint256 nonce,uint64 deadline)')
);

let signer: Wallet | null = null;
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
 */
export function initSigner(privateKey: string, chainId: number = 84532): void {
  signer = new Wallet(privateKey);
  currentChainId = chainId;
  console.log('Attestation signer initialized:', signer.address);
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
  recipient: string,
  chainId?: number
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const encoder = getEncoder(NUMERIC_POLICY_SCHEMA);
  const encodedData = encoder.encodeData([
    { name: 'result', value: data.result, type: 'uint256' },
    { name: 'units', value: data.units, type: 'string' },
    { name: 'inputRefs', value: data.inputRefs, type: 'bytes32[]' },
    { name: 'timestamp', value: data.timestamp, type: 'uint64' },
    { name: 'operation', value: data.operation, type: 'string' },
  ]);

  return signDelegatedAttestation(encodedData, schemaUid, recipient, chainId);
}

/**
 * Sign a boolean policy attestation (for contains, within, intersects operations).
 */
export async function signBooleanAttestation(
  data: BooleanPolicyAttestationData,
  schemaUid: string,
  recipient: string,
  chainId?: number
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const encoder = getEncoder(BOOLEAN_POLICY_SCHEMA);
  const encodedData = encoder.encodeData([
    { name: 'result', value: data.result, type: 'bool' },
    { name: 'inputRefs', value: data.inputRefs, type: 'bytes32[]' },
    { name: 'timestamp', value: data.timestamp, type: 'uint64' },
    { name: 'operation', value: data.operation, type: 'string' },
  ]);

  return signDelegatedAttestation(encodedData, schemaUid, recipient, chainId);
}

/**
 * Create and sign a delegated attestation.
 * Returns split attestation and delegatedAttestation objects.
 * @param chainId - Optional chainId to use for signing. Falls back to global currentChainId.
 */
async function signDelegatedAttestation(
  encodedData: string,
  schemaUid: string,
  recipient: string,
  chainId?: number
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

  // Use provided chainId or fall back to global currentChainId
  const effectiveChainId = chainId ?? currentChainId;

  // Build EIP-712 typed data
  const domain = {
    name: EAS_DOMAIN_NAME,
    version: EAS_DOMAIN_VERSION,
    chainId: effectiveChainId,
    verifyingContract: EAS_CONTRACT_ADDRESSES[effectiveChainId],
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
    },
  };
}

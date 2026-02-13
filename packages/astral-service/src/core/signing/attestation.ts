import { SchemaEncoder } from '@ethereum-attestation-service/eas-sdk';
import { Wallet, HDNodeWallet, JsonRpcProvider, Contract } from 'ethers';
import type { SigningResult } from '../types/index.js';
import type { NumericPolicyAttestationData, BooleanPolicyAttestationData } from '../../compute/types/index.js';
import type { VerifyAttestationData } from '../../verify/types/index.js';
import { NUMERIC_POLICY_SCHEMA, BOOLEAN_POLICY_SCHEMA, VERIFY_SCHEMA } from './schemas.js';

// RPC URLs for nonce sync
const RPC_URLS: Record<number, string> = {
  84532: 'https://sepolia.base.org',
  8453: 'https://mainnet.base.org',
};

// Minimal ABI for getNonce
const EAS_ABI = ['function getNonce(address) view returns (uint256)'];

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
let easContract: Contract | null = null;

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
 * Get the current nonce from EAS contract.
 * This ensures nonce is always in sync, even if previous attestations weren't submitted.
 */
async function getCurrentNonce(): Promise<bigint> {
  if (!signer || !easContract) {
    throw new Error('Signer or EAS contract not initialized');
  }
  const nonce = await easContract.getNonce(signer.address);
  return BigInt(nonce);
}

/**
 * Initialize EAS contract for nonce queries.
 */
function initEASContract(chainId: number): void {
  const rpcUrl = RPC_URLS[chainId];
  const easAddress = EAS_CONTRACT_ADDRESSES[chainId];

  if (!rpcUrl || !easAddress) {
    console.warn(`No RPC URL or EAS address for chain ${chainId}, nonce queries will fail`);
    return;
  }

  const provider = new JsonRpcProvider(rpcUrl);
  easContract = new Contract(easAddress, EAS_ABI, provider);
  console.log('EAS contract initialized for nonce queries');
}

/**
 * Initialize the signing service with a private key.
 */
export function initSigner(privateKey: string, chainId: number = 84532): void {
  signer = new Wallet(privateKey);
  currentChainId = chainId;
  initEASContract(chainId);
  console.log('Attestation signer initialized:', signer.address);
}

/**
 * Initialize the signing service from a mnemonic phrase.
 * Used in EigenCompute TEE environment where mnemonic is securely stored.
 */
export function initSignerFromMnemonic(mnemonic: string, chainId: number = 84532): void {
  signer = Wallet.fromPhrase(mnemonic);
  currentChainId = chainId;
  initEASContract(chainId);
  console.log('Attestation signer initialized from mnemonic:', signer.address);
}

/**
 * @deprecated Use getCurrentNonce() instead - nonce is now queried from EAS on each request
 */
export function setNonce(_newNonce: bigint): void {
  console.warn('setNonce is deprecated - nonce is now queried from EAS on each request');
}

/**
 * @deprecated Nonce is now queried from EAS on each request
 */
export async function syncNonceFromEAS(): Promise<void> {
  console.log('syncNonceFromEAS is deprecated - nonce is now queried from EAS on each signing request');
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
  refUID?: string
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

  return signDelegatedAttestation(encodedData, schemaUid, recipient, refUID);
}

/**
 * Sign a boolean policy attestation (for contains, within, intersects operations).
 */
export async function signBooleanAttestation(
  data: BooleanPolicyAttestationData,
  schemaUid: string,
  recipient: string,
  refUID?: string
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

  return signDelegatedAttestation(encodedData, schemaUid, recipient, refUID);
}

/**
 * Sign a verify attestation (for verified location proofs).
 *
 * Encodes CredibilityVector dimensions as basis points (uint16)
 * and raw distance values (uint32). No summary score.
 */
export async function signVerifyAttestation(
  data: VerifyAttestationData,
  schemaUid: string,
  recipient: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const encoder = getEncoder(VERIFY_SCHEMA);
  const encodedData = encoder.encodeData([
    { name: 'proofHash', value: data.proofHash, type: 'bytes32' },
    { name: 'meanDistanceMeters', value: data.meanDistanceMeters, type: 'uint32' },
    { name: 'maxDistanceMeters', value: data.maxDistanceMeters, type: 'uint32' },
    { name: 'withinRadiusBp', value: data.withinRadiusBp, type: 'uint16' },
    { name: 'meanOverlapBp', value: data.meanOverlapBp, type: 'uint16' },
    { name: 'minOverlapBp', value: data.minOverlapBp, type: 'uint16' },
    { name: 'signaturesValidBp', value: data.signaturesValidBp, type: 'uint16' },
    { name: 'structureValidBp', value: data.structureValidBp, type: 'uint16' },
    { name: 'signalsConsistentBp', value: data.signalsConsistentBp, type: 'uint16' },
    { name: 'uniquePluginRatioBp', value: data.uniquePluginRatioBp, type: 'uint16' },
    { name: 'stampCount', value: data.stampCount, type: 'uint8' },
  ]);

  return signDelegatedAttestation(encodedData, schemaUid, recipient);
}

/**
 * Create and sign a delegated attestation.
 * Returns split attestation and delegatedAttestation objects.
 */
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

async function signDelegatedAttestation(
  encodedData: string,
  schemaUid: string,
  recipient: string,
  refUID?: string
): Promise<SigningResult> {
  if (!signer) {
    throw new Error('Signer not initialized');
  }

  const currentNonce = await getCurrentNonce();
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const deadline = BigInt(deadlineTimestamp);

  const message = {
    schema: schemaUid,
    recipient,
    expirationTime: 0n, // No expiration
    revocable: true,
    refUID: refUID ?? ZERO_BYTES32,
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

/**
 * EAS client for fetching attestations by UID.
 *
 * This module provides functions to query EAS contracts
 * and decode attestation data.
 */

import { JsonRpcProvider, Contract, AbiCoder, FetchRequest } from 'ethers';

// RPC timeout in milliseconds
const RPC_TIMEOUT_MS = 10000;

// Default RPC URLs by chain ID (can be overridden via environment variables)
const DEFAULT_RPC_URLS: Record<number, string> = {
  84532: 'https://sepolia.base.org',      // Base Sepolia
  8453: 'https://mainnet.base.org',       // Base Mainnet
  11155111: 'https://sepolia.gateway.tenderly.co', // Sepolia
  1: 'https://eth.llamarpc.com',          // Ethereum Mainnet
};

// Environment variable names for RPC URL overrides
const RPC_ENV_VARS: Record<number, string> = {
  84532: 'RPC_URL_BASE_SEPOLIA',
  8453: 'RPC_URL_BASE_MAINNET',
  11155111: 'RPC_URL_SEPOLIA',
  1: 'RPC_URL_ETHEREUM',
};

/**
 * Get RPC URL for a chain, checking environment variable override first.
 */
function getRpcUrl(chainId: number): string | undefined {
  const envVar = RPC_ENV_VARS[chainId];
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }
  return DEFAULT_RPC_URLS[chainId];
}

// UID format validation regex (bytes32 hex string)
const UID_FORMAT_REGEX = /^0x[a-fA-F0-9]{64}$/;

// EAS contract addresses by chain ID
const EAS_CONTRACT_ADDRESSES: Record<number, string> = {
  84532: '0x4200000000000000000000000000000000000021',  // Base Sepolia
  8453: '0x4200000000000000000000000000000000000021',   // Base Mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587',      // Ethereum Mainnet
};

// Minimal EAS ABI for getAttestation
const EAS_ABI = [
  'function getAttestation(bytes32 uid) view returns (tuple(bytes32 uid, bytes32 schema, uint64 time, uint64 expirationTime, uint64 revocationTime, bytes32 refUID, address recipient, address attester, bool revocable, bytes data))',
];

// Location Protocol v0.2 schema
export const LOCATION_PROTOCOL_SCHEMA = 'string lp_version, string srs, string location_type, string location';

// Attestation structure from EAS
export interface EASAttestation {
  uid: string;
  schema: string;
  time: bigint;
  expirationTime: bigint;
  revocationTime: bigint;
  refUID: string;
  recipient: string;
  attester: string;
  revocable: boolean;
  data: string;
}

// Decoded location attestation data
export interface LocationAttestationData {
  lpVersion: string;
  srs: string;
  locationType: string;
  location: string; // GeoJSON string
}

// Cache for providers and contracts
const providerCache = new Map<number, JsonRpcProvider>();
const contractCache = new Map<number, Contract>();

/**
 * Get or create a provider for a chain with timeout configuration.
 */
function getProvider(chainId: number): JsonRpcProvider {
  let provider = providerCache.get(chainId);
  if (!provider) {
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) {
      throw new Error(`Unsupported chain ID: ${chainId}. Supported chains: ${Object.keys(DEFAULT_RPC_URLS).join(', ')}`);
    }
    // Create FetchRequest with timeout
    const fetchRequest = new FetchRequest(rpcUrl);
    fetchRequest.timeout = RPC_TIMEOUT_MS;
    provider = new JsonRpcProvider(fetchRequest);
    providerCache.set(chainId, provider);
  }
  return provider;
}

/**
 * Get or create an EAS contract instance for a chain.
 */
function getEASContract(chainId: number): Contract {
  let contract = contractCache.get(chainId);
  if (!contract) {
    const address = EAS_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`No EAS contract address for chain ID: ${chainId}`);
    }
    const provider = getProvider(chainId);
    contract = new Contract(address, EAS_ABI, provider);
    contractCache.set(chainId, contract);
  }
  return contract;
}

/**
 * Fetch an attestation from EAS by UID.
 *
 * @param uid - The attestation UID (bytes32 hex string)
 * @param chainId - The chain ID to query
 * @returns The attestation data
 * @throws If the attestation doesn't exist, is invalid, or chain is unsupported
 */
export async function getAttestation(uid: string, chainId: number): Promise<EASAttestation> {
  // Validate UID format
  if (!UID_FORMAT_REGEX.test(uid)) {
    throw new Error(`Invalid attestation UID format: ${uid}. Expected bytes32 hex string (0x followed by 64 hex chars)`);
  }

  const contract = getEASContract(chainId);

  let result;
  try {
    result = await contract.getAttestation(uid);
  } catch (error) {
    // Wrap network errors with user-friendly message
    if (error instanceof Error && (error.message.includes('network') || error.message.includes('timeout'))) {
      throw new Error(`Failed to connect to chain ${chainId}. Please try again later.`);
    }
    throw error;
  }

  // Check if attestation exists (uid will be zero bytes if not found)
  const zeroUid = '0x0000000000000000000000000000000000000000000000000000000000000000';
  if (result.uid === zeroUid) {
    throw new Error(`Attestation not found: ${uid} on chain ${chainId}`);
  }

  // Check if attestation is revoked
  if (result.revocationTime > 0n) {
    throw new Error(`Attestation has been revoked: ${uid}`);
  }

  // Check if attestation has expired
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (result.expirationTime > 0n && result.expirationTime < now) {
    throw new Error(`Attestation has expired: ${uid}`);
  }

  return {
    uid: result.uid,
    schema: result.schema,
    time: result.time,
    expirationTime: result.expirationTime,
    revocationTime: result.revocationTime,
    refUID: result.refUID,
    recipient: result.recipient,
    attester: result.attester,
    revocable: result.revocable,
    data: result.data,
  };
}

/**
 * Decode Location Protocol attestation data.
 *
 * @param data - ABI-encoded attestation data
 * @returns Decoded location attestation fields
 */
export function decodeLocationAttestation(data: string): LocationAttestationData {
  const abiCoder = AbiCoder.defaultAbiCoder();

  try {
    const decoded = abiCoder.decode(
      ['string', 'string', 'string', 'string'],
      data
    );

    return {
      lpVersion: decoded[0],
      srs: decoded[1],
      locationType: decoded[2],
      location: decoded[3],
    };
  } catch (error) {
    throw new Error(`Failed to decode location attestation data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a chain ID is supported.
 */
export function isSupportedChain(chainId: number): boolean {
  return chainId in DEFAULT_RPC_URLS && chainId in EAS_CONTRACT_ADDRESSES;
}

/**
 * Get the list of supported chain IDs.
 */
export function getSupportedChains(): number[] {
  return Object.keys(DEFAULT_RPC_URLS).map(Number);
}

/**
 * Clear provider and contract caches.
 * Useful for testing.
 */
export function clearCaches(): void {
  providerCache.clear();
  contractCache.clear();
}

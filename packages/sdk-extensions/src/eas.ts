import { EAS } from '@ethereum-attestation-service/eas-sdk';
import type { Signer } from 'ethers';
import type {
  DelegatedAttestation,
  SubmitDelegatedOptions,
  AttestationObject,
  DelegatedAttestationObject,
} from './types.js';

// Result type for attestation submission
export interface AttestationResult {
  uid: string;
}

// EAS contract addresses by chain
const EAS_CONTRACT_ADDRESSES: Record<number, string> = {
  84532: '0x4200000000000000000000000000000000000021', // Base Sepolia
  8453: '0x4200000000000000000000000000000000000021',  // Base Mainnet
  1: '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587',     // Ethereum Mainnet
  11155111: '0xC2679fBD37d54388Ce493F1DB75320D236e1815e', // Sepolia
};

/**
 * Split a combined hex signature (65 bytes) into v, r, s components.
 * Signature format: 0x + r (32 bytes) + s (32 bytes) + v (1 byte)
 */
export function splitSignature(signature: string): { v: number; r: string; s: string } {
  // Remove 0x prefix if present
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: expected 130 hex chars, got ${sig.length}`);
  }

  const r = '0x' + sig.slice(0, 64);
  const s = '0x' + sig.slice(64, 128);
  const v = parseInt(sig.slice(128, 130), 16);

  return { v, r, s };
}

/**
 * Options for submitting with new flat API response format.
 */
export interface SubmitFromApiResponseOptions {
  /** refUID for the attestation (default: zero bytes32) */
  refUID?: string;
  /** Whether the attestation is revocable (default: true) */
  revocable?: boolean;
  /** Expiration time as bigint (default: 0n = no expiration) */
  expirationTime?: bigint;
  /** Value in wei (default: 0n) */
  value?: bigint;
}

/**
 * AstralEAS - Helper for submitting delegated attestations to EAS
 */
export class AstralEAS {
  private readonly eas: EAS;
  private readonly signer: Signer;

  constructor(signer: Signer, chainId: number, easContractAddress?: string) {
    const address = easContractAddress || EAS_CONTRACT_ADDRESSES[chainId];
    if (!address) {
      throw new Error(`No EAS contract address for chain ${chainId}`);
    }

    this.eas = new EAS(address);
    this.eas.connect(signer);
    this.signer = signer;
  }

  /**
   * Submit a delegated attestation to EAS using the legacy nested format.
   * The caller pays gas; Astral remains the attester.
   * Returns the attestation UID.
   */
  async submitDelegated(attestation: DelegatedAttestation): Promise<AttestationResult> {
    const { message, signature, attester } = attestation;

    const tx = await this.eas.attestByDelegation({
      schema: message.schema,
      data: {
        recipient: message.recipient,
        expirationTime: message.expirationTime,
        revocable: message.revocable,
        refUID: message.refUID,
        data: message.data,
        value: message.value,
      },
      signature: {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      attester,
      deadline: message.deadline,
    });

    const uid = await tx.wait();
    return { uid };
  }

  /**
   * Submit a delegated attestation using the new flat API response format.
   * Accepts the attestation and delegatedAttestation objects directly from the API response.
   * The caller pays gas; Astral remains the attester.
   * Returns the attestation UID.
   */
  async submitFromApiResponse(
    attestation: AttestationObject,
    delegatedAttestation: DelegatedAttestationObject,
    options: SubmitFromApiResponseOptions = {}
  ): Promise<AttestationResult> {
    const {
      refUID = '0x0000000000000000000000000000000000000000000000000000000000000000',
      revocable = true,
      expirationTime = 0n,
      value = 0n,
    } = options;

    // Split the combined signature into v, r, s
    const sig = splitSignature(attestation.signature);

    const tx = await this.eas.attestByDelegation({
      schema: attestation.schema,
      data: {
        recipient: attestation.recipient,
        expirationTime,
        revocable,
        refUID,
        data: attestation.data,
        value,
      },
      signature: sig,
      attester: delegatedAttestation.attester,
      deadline: BigInt(delegatedAttestation.deadline),
    });

    const uid = await tx.wait();
    return { uid };
  }

  /**
   * Estimate gas for submitting a delegated attestation (legacy format).
   * @param attestation - The delegated attestation in legacy nested format
   * @returns Estimated gas as bigint
   */
  async estimateGas(attestation: DelegatedAttestation): Promise<bigint> {
    const { message, signature, attester } = attestation;

    // Access the underlying contract for gas estimation
    const contract = this.eas.contract;

    // Build the attestation request data structure
    const request = {
      schema: message.schema,
      data: {
        recipient: message.recipient,
        expirationTime: message.expirationTime,
        revocable: message.revocable,
        refUID: message.refUID,
        data: message.data,
        value: message.value,
      },
      signature: {
        v: signature.v,
        r: signature.r,
        s: signature.s,
      },
      attester,
      deadline: message.deadline,
    };

    // Use ethers contract's estimateGas method
    const gasEstimate = await contract.attestByDelegation.estimateGas(request);

    return gasEstimate;
  }

  /**
   * Estimate gas for submitting using the new flat API response format.
   * @param attestation - The attestation object from API response
   * @param delegatedAttestation - The delegatedAttestation object from API response
   * @param options - Optional parameters for the attestation
   * @returns Estimated gas as bigint
   */
  async estimateGasFromApiResponse(
    attestation: AttestationObject,
    delegatedAttestation: DelegatedAttestationObject,
    options: SubmitFromApiResponseOptions = {}
  ): Promise<bigint> {
    const {
      refUID = '0x0000000000000000000000000000000000000000000000000000000000000000',
      revocable = true,
      expirationTime = 0n,
      value = 0n,
    } = options;

    // Split the combined signature into v, r, s
    const sig = splitSignature(attestation.signature);

    // Access the underlying contract for gas estimation
    const contract = this.eas.contract;

    // Build the attestation request data structure
    const request = {
      schema: attestation.schema,
      data: {
        recipient: attestation.recipient,
        expirationTime,
        revocable,
        refUID,
        data: attestation.data,
        value,
      },
      signature: sig,
      attester: delegatedAttestation.attester,
      deadline: BigInt(delegatedAttestation.deadline),
    };

    // Use ethers contract's estimateGas method
    const gasEstimate = await contract.attestByDelegation.estimateGas(request);

    return gasEstimate;
  }

  /**
   * Get the EAS contract address being used.
   */
  getContractAddress(): string {
    return this.eas.contract.target as string;
  }
}

/**
 * Create an AstralEAS instance.
 */
export function createAstralEAS(
  signer: Signer,
  chainId: number,
  easContractAddress?: string
): AstralEAS {
  return new AstralEAS(signer, chainId, easContractAddress);
}

/**
 * Submit a delegated attestation using a one-off helper function (legacy format).
 */
export async function submitDelegatedAttestation(
  attestation: DelegatedAttestation,
  options: SubmitDelegatedOptions & { chainId: number }
): Promise<AttestationResult> {
  const eas = createAstralEAS(
    options.signer,
    options.chainId,
    options.easContractAddress
  );
  return eas.submitDelegated(attestation);
}

/**
 * Submit a delegated attestation from the new flat API response format.
 * This is the recommended way to submit attestations from the Astral API.
 */
export async function submitFromApiResponse(
  attestation: AttestationObject,
  delegatedAttestation: DelegatedAttestationObject,
  options: SubmitDelegatedOptions & { chainId: number } & SubmitFromApiResponseOptions
): Promise<AttestationResult> {
  const eas = createAstralEAS(
    options.signer,
    options.chainId,
    options.easContractAddress
  );
  return eas.submitFromApiResponse(attestation, delegatedAttestation, options);
}

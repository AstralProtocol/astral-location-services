import { EAS } from '@ethereum-attestation-service/eas-sdk';
import type { Signer } from 'ethers';
import type { DelegatedAttestation, SubmitDelegatedOptions } from './types.js';

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
   * Submit a delegated attestation to EAS.
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
 * Submit a delegated attestation using a one-off helper function.
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

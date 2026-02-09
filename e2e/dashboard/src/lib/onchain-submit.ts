import { ethers } from 'ethers';

const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';
const EAS_ABI = [
  `function attestByDelegation(
    tuple(
      bytes32 schema,
      tuple(
        address recipient,
        uint64 expirationTime,
        bool revocable,
        bytes32 refUID,
        bytes data,
        uint256 value
      ) data,
      tuple(uint8 v, bytes32 r, bytes32 s) signature,
      address attester,
      uint64 deadline
    ) delegatedRequest
  ) external payable returns (bytes32)`,
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
];

export interface AttestationData {
  schema: string;
  recipient: string;
  data: string;
  signature: string;
}

export interface DelegatedAttestationData {
  attester: string;
  deadline: number | string;
}

export interface SubmitResult {
  txHash: string;
  uid: string | null;
  blockNumber: number;
}

/**
 * Extract attestation + delegatedAttestation from a test result's assertion details.
 * Returns null if this test doesn't have attestation data.
 */
export function extractAttestationData(
  assertions: { details?: Record<string, unknown> }[]
): { attestation: AttestationData; delegatedAttestation: DelegatedAttestationData } | null {
  for (const a of assertions) {
    if (!a.details) continue;
    const actual = a.details.actual;
    if (actual && typeof actual === 'object' && 'attestation' in (actual as any) && 'delegatedAttestation' in (actual as any)) {
      const obj = actual as Record<string, any>;
      return {
        attestation: obj.attestation as AttestationData,
        delegatedAttestation: obj.delegatedAttestation as DelegatedAttestationData,
      };
    }
  }
  return null;
}

/**
 * Submit a delegated attestation onchain via EAS.
 */
export async function submitAttestation(
  signer: ethers.Signer,
  attestation: AttestationData,
  delegatedAttestation: DelegatedAttestationData,
): Promise<SubmitResult> {
  const sig = ethers.Signature.from(attestation.signature);

  const delegatedRequest = {
    schema: attestation.schema,
    data: {
      recipient: attestation.recipient,
      expirationTime: 0n,
      revocable: true,
      refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
      data: attestation.data,
      value: 0n,
    },
    signature: { v: sig.v, r: sig.r, s: sig.s },
    attester: delegatedAttestation.attester,
    deadline: BigInt(delegatedAttestation.deadline),
  };

  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer);
  const tx = await eas.attestByDelegation(delegatedRequest);
  const receipt = await tx.wait();

  const event = receipt.logs.find((log: any) => {
    try {
      return eas.interface.parseLog(log)?.name === 'Attested';
    } catch {
      return false;
    }
  });

  const uid = event ? eas.interface.parseLog(event)?.args?.uid ?? null : null;

  return {
    txHash: receipt.hash,
    uid,
    blockNumber: receipt.blockNumber,
  };
}

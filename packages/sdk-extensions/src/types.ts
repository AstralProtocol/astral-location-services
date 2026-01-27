import type { Geometry } from 'geojson';

// Input types
export type RawGeometryInput = Geometry;

export interface OnchainInput {
  uid: string;
}

export interface OffchainInput {
  uid: string;
  uri: string;
}

export type Input = RawGeometryInput | OnchainInput | OffchainInput;

// Compute options
export interface ComputeOptions {
  schema: string;
  recipient: string;
}

// Attestation types
export interface DelegatedAttestationMessage {
  schema: string;
  recipient: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  data: string;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface DelegatedAttestationSignature {
  v: number;
  r: string;
  s: string;
}

export interface DelegatedAttestation {
  message: DelegatedAttestationMessage;
  signature: DelegatedAttestationSignature;
  attester: string;
}

// Response types
export interface NumericComputeResult {
  attestation: DelegatedAttestation;
  result: {
    value: number;
    units: string;
  };
  inputs: {
    refs: string[];
  };
}

export interface BooleanComputeResult {
  attestation: DelegatedAttestation;
  result: {
    value: number; // 1 for true, 0 for false
    units: 'boolean';
  };
  inputs: {
    refs: string[];
  };
}

export type ComputeResult = NumericComputeResult | BooleanComputeResult;

// SDK configuration
export interface AstralComputeConfig {
  apiUrl: string;
  chainId: number;
}

// EAS submission types
export interface SubmitDelegatedOptions {
  signer: any; // ethers.Signer
  easContractAddress?: string;
}

import type {
  AttestationObject,
  DelegatedAttestationObject,
} from './types.js';

// ============================================================================
// Verify SDK Types
// ============================================================================

/**
 * Subject identifier following DID pattern (scheme:value).
 */
export interface SubjectIdentifier {
  scheme: string;
  value: string;
}

/**
 * Temporal bounds.
 */
export interface TimeBounds {
  start: number;
  end: number;
}

/**
 * GeoJSON-style location or string (e.g., H3 index).
 */
export type LocationData = object | string;

/**
 * Location Claim - assertion about timing and location of an event.
 */
export interface LocationClaim {
  lpVersion: string;
  locationType: string;
  location: LocationData;
  srs: string;
  subject: SubjectIdentifier;
  radius: number;
  time: TimeBounds;
  eventType?: string;
}

/**
 * Cryptographic signature.
 */
export interface Signature {
  signer: SubjectIdentifier;
  algorithm: string;
  value: string;
  timestamp: number;
}

/**
 * Location Stamp - evidence from a proof-of-location system.
 */
export interface LocationStamp {
  lpVersion: string;
  locationType: string;
  location: LocationData;
  srs: string;
  temporalFootprint: TimeBounds;
  plugin: string;
  pluginVersion: string;
  signals: Record<string, unknown>;
  signatures: Signature[];
}

/**
 * Location Proof - claim bundled with supporting stamps.
 */
export interface LocationProof {
  claim: LocationClaim;
  stamps: LocationStamp[];
}

/**
 * Result of verifying a single stamp.
 */
export interface StampResult {
  stampIndex: number;
  plugin: string;
  signaturesValid: boolean;
  structureValid: boolean;
  signalsConsistent: boolean;
  supportsClaim: boolean;
  claimSupportScore: number;
  pluginResult: Record<string, unknown>;
}

/**
 * Cross-correlation assessment for multi-stamp proofs.
 */
export interface CorrelationAssessment {
  independence: number;
  agreement: number;
  notes: string[];
}

/**
 * Credibility assessment - output of verification.
 */
export interface CredibilityAssessment {
  confidence: number;
  stampResults: StampResult[];
  correlation?: CorrelationAssessment;
  dimensions?: Record<string, number>;
}

/**
 * Result of stamp verification (no claim evaluation).
 */
export interface StampVerificationResult {
  valid: boolean;
  signaturesValid: boolean;
  structureValid: boolean;
  signalsConsistent: boolean;
  details: Record<string, unknown>;
}

/**
 * Plugin metadata.
 */
export interface PluginInfo {
  name: string;
  version: string;
  environments: string[];
  description: string;
}

/**
 * Result of proof verification.
 */
export interface VerifyProofResult {
  uid: string;
  credibility: CredibilityAssessment;
  proof: LocationProof;
  attestation: AttestationObject;
  delegatedAttestation: DelegatedAttestationObject;
  attester: string;
  timestamp: number;
}

/**
 * Options for proof verification.
 */
export interface VerifyOptions {
  schema?: string;
  recipient?: string;
  submitOnchain?: boolean;
}

/**
 * Configuration for AstralVerify.
 */
export interface AstralVerifyConfig {
  apiUrl?: string;
  chainId: number;
}

// ============================================================================
// AstralVerify SDK
// ============================================================================

/**
 * Astral Verify SDK
 *
 * Provides methods for location verification via the Astral Location Services API.
 */
export class AstralVerify {
  private readonly apiUrl: string;
  private readonly chainId: number;

  constructor(config: AstralVerifyConfig) {
    this.apiUrl = config.apiUrl?.replace(/\/$/, '') ?? 'https://api.astral.global';
    this.chainId = config.chainId;
  }

  /**
   * Verify a stamp's internal validity.
   *
   * This checks signatures, structure, and signal consistency
   * but does NOT assess the stamp against a claim.
   */
  async stamp(stamp: LocationStamp): Promise<StampVerificationResult> {
    return this.request('/verify/v0/stamp', { stamp }) as Promise<StampVerificationResult>;
  }

  /**
   * Verify a location proof and return a credibility assessment.
   *
   * This:
   * 1. Verifies each stamp's internal validity
   * 2. Assesses each stamp against the claim
   * 3. Analyzes cross-correlation (for multi-stamp proofs)
   * 4. Returns a credibility assessment with a signed attestation
   */
  async proof(
    proof: LocationProof,
    options?: VerifyOptions
  ): Promise<VerifyProofResult> {
    return this.request('/verify/v0/proof', {
      proof,
      options: {
        schema: options?.schema,
        recipient: options?.recipient,
        submitOnchain: options?.submitOnchain ?? false,
      },
    }) as Promise<VerifyProofResult>;
  }

  /**
   * List available verification plugins.
   */
  async plugins(): Promise<PluginInfo[]> {
    const response = await fetch(`${this.apiUrl}/verify/v0/plugins`);
    if (!response.ok) {
      throw new Error(`Failed to list plugins: ${response.statusText}`);
    }
    const data = (await response.json()) as { plugins: PluginInfo[] };
    return data.plugins;
  }

  /**
   * Make a POST request to the verify service.
   */
  private async request(endpoint: string, body: object): Promise<unknown> {
    const response = await fetch(`${this.apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chainId: this.chainId,
        ...body,
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({ detail: response.statusText }))) as { detail?: string };
      throw new Error(`Astral API error: ${errorBody.detail || response.statusText}`);
    }

    return response.json();
  }
}

/**
 * Create an AstralVerify instance.
 */
export function createAstralVerify(config: AstralVerifyConfig): AstralVerify {
  return new AstralVerify(config);
}

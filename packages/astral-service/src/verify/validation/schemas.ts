import { z } from 'zod';
import { GeometrySchema, ChainIdSchema, OptionalSchemaUidSchema, RecipientSchema } from '../../compute/validation/schemas.js';

/**
 * Zod validation schemas for the Verify module.
 * Validates location claims, stamps, proofs, and API requests.
 */

// ============================================
// Subject Identifier
// ============================================

export const SubjectIdentifierSchema = z.object({
  scheme: z.string().min(1, 'Subject scheme is required'),
  value: z.string().min(1, 'Subject value is required'),
});

// ============================================
// Time Bounds
// ============================================

export const TimeBoundsSchema = z.object({
  start: z.number().int().positive('Start time must be a positive Unix timestamp'),
  end: z.number().int().positive('End time must be a positive Unix timestamp'),
}).refine(
  (data) => data.end >= data.start,
  { message: 'End time must be >= start time' }
);

// ============================================
// Signature
// ============================================

export const SignatureSchema = z.object({
  signer: SubjectIdentifierSchema,
  algorithm: z.string().min(1, 'Algorithm is required'),
  value: z.string().min(1, 'Signature value is required'),
  timestamp: z.number().int().positive('Signature timestamp must be a positive Unix timestamp'),
});

// ============================================
// Location Claim
// ============================================

// Location data can be GeoJSON geometry or a string (e.g., H3 index)
const LocationDataSchema = z.union([
  GeometrySchema,
  z.string(), // For H3 index, plus codes, etc.
]);

export const LocationClaimSchema = z.object({
  // Location Protocol v0.2 fields
  lpVersion: z.string().refine(
    (v) => v === '0.2',
    { message: 'lpVersion must be "0.2"' }
  ),
  locationType: z.string().min(1, 'locationType is required'),
  location: LocationDataSchema,
  srs: z.string().url('srs must be a valid URI'),

  // Verification-specific fields
  subject: SubjectIdentifierSchema,
  radius: z.number().positive('Radius must be positive (meters)'),
  time: TimeBoundsSchema,
  eventType: z.string().optional(),
});

// ============================================
// Location Stamp
// ============================================

export const LocationStampSchema = z.object({
  // Location Protocol v0.2 fields
  lpVersion: z.string().refine(
    (v) => v === '0.2',
    { message: 'lpVersion must be "0.2"' }
  ),
  locationType: z.string().min(1, 'locationType is required'),
  location: LocationDataSchema,
  srs: z.string().url('srs must be a valid URI'),

  // Temporal footprint
  temporalFootprint: TimeBoundsSchema,

  // Plugin identification
  plugin: z.string().min(1, 'plugin name is required'),
  pluginVersion: z.string().min(1, 'pluginVersion is required'),

  // Plugin-specific evidence
  signals: z.record(z.string(), z.unknown()),

  // Cryptographic binding
  signatures: z.array(SignatureSchema).min(1, 'At least one signature is required'),
});

// ============================================
// Location Proof
// ============================================

export const LocationProofSchema = z.object({
  claim: LocationClaimSchema,
  stamps: z.array(LocationStampSchema).min(1, 'At least one stamp is required'),
});

// ============================================
// API Request Schemas
// ============================================

/**
 * POST /verify/v0/stamp - Verify stamp internal validity
 */
export const VerifyStampRequestSchema = z.object({
  stamp: LocationStampSchema,
});

/**
 * Verify proof options
 */
export const VerifyProofOptionsSchema = z.object({
  chainId: ChainIdSchema.optional(),
  submitOnchain: z.boolean().optional().default(false),
  schema: OptionalSchemaUidSchema,
  recipient: RecipientSchema,
});

/**
 * POST /verify/v0/proof - Verify location proof
 */
export const VerifyProofRequestSchema = z.object({
  proof: LocationProofSchema,
  options: VerifyProofOptionsSchema.optional(),
});

// ============================================
// Type Exports
// ============================================

export type ValidatedLocationClaim = z.infer<typeof LocationClaimSchema>;
export type ValidatedLocationStamp = z.infer<typeof LocationStampSchema>;
export type ValidatedLocationProof = z.infer<typeof LocationProofSchema>;
export type ValidatedVerifyStampRequest = z.infer<typeof VerifyStampRequestSchema>;
export type ValidatedVerifyProofRequest = z.infer<typeof VerifyProofRequestSchema>;

import { z } from 'zod';
import type { Input } from '../types/index.js';

/**
 * Shared Zod validation schemas for GeoJSON and compute requests.
 * Centralizes validation logic to avoid duplication across routes.
 */

// Coordinate validation: [longitude, latitude, optional altitude]
const CoordinateSchema = z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90),   // latitude
]).or(z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90),   // latitude
  z.number(),                     // altitude (optional, no bounds)
]));

// Position array for different geometry types
const PositionSchema = CoordinateSchema;
const LineStringPositions = z.array(PositionSchema).min(2);
const LinearRingPositions = z.array(PositionSchema).min(4); // Closed ring
const PolygonPositions = z.array(LinearRingPositions).min(1);

// Geometry type schemas with proper coordinate validation
const PointSchema = z.object({
  type: z.literal('Point'),
  coordinates: PositionSchema,
});

const MultiPointSchema = z.object({
  type: z.literal('MultiPoint'),
  coordinates: z.array(PositionSchema),
});

const LineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: LineStringPositions,
});

const MultiLineStringSchema = z.object({
  type: z.literal('MultiLineString'),
  coordinates: z.array(LineStringPositions),
});

const PolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: PolygonPositions,
});

const MultiPolygonSchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(PolygonPositions),
});

// GeometryCollection requires lazy evaluation for recursion
export type GeometryCollectionType = {
  type: 'GeometryCollection';
  geometries: Array<z.infer<typeof BaseGeometrySchema> | GeometryCollectionType>;
};

const BaseGeometrySchema = z.discriminatedUnion('type', [
  PointSchema,
  MultiPointSchema,
  LineStringSchema,
  MultiLineStringSchema,
  PolygonSchema,
  MultiPolygonSchema,
]);

// Full geometry schema including GeometryCollection
export const GeometrySchema: z.ZodType<
  z.infer<typeof BaseGeometrySchema> | GeometryCollectionType
> = z.lazy(() =>
  z.union([
    BaseGeometrySchema,
    z.object({
      type: z.literal('GeometryCollection'),
      geometries: z.array(GeometrySchema),
    }),
  ])
);

// Verified proof input — validates just enough for geometry extraction
const VerifiedProofInputSchema = z.object({
  verifiedProof: z.object({
    proof: z.object({
      claim: z.object({
        location: z.union([
          z.object({
            type: z.enum([
              'Point', 'MultiPoint', 'LineString', 'MultiLineString',
              'Polygon', 'MultiPolygon', 'GeometryCollection',
            ]),
          }).passthrough(),
          z.string(),
        ]),
      }).passthrough(),
    }).passthrough(),
    credibility: z.object({}).passthrough(),
    attestation: z.object({
      uid: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid attestation UID format'),
    }).passthrough(),
    evaluatedAt: z.number(),
    evaluationMethod: z.string(),
  }).passthrough(),
});

// Input can be raw GeoJSON, verified proof, or UID references
// Cast needed because Zod's passthrough inference doesn't match exact TS interfaces
export const InputSchema: z.ZodType<Input> = z.union([
  GeometrySchema,
  VerifiedProofInputSchema,
  z.object({ uid: z.string(), uri: z.string().url() }),
  z.object({ uid: z.string() }),
]) as z.ZodType<Input>;

// Common request fields
export const ChainIdSchema = z.number().int().positive('chainId must be a positive integer');
export const SchemaUidSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid schema UID');
export const OptionalSchemaUidSchema = SchemaUidSchema.optional();
export const RecipientSchema = z.string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address')
  .optional()
  .default('0x0000000000000000000000000000000000000000');

// Base request schema (common fields across all endpoints)
// schema is optional - if not provided, the API uses configured defaults
const BaseRequestSchema = z.object({
  chainId: ChainIdSchema,
  schema: OptionalSchemaUidSchema,
  recipient: RecipientSchema,
});

// Endpoint-specific request schemas
export const DistanceRequestSchema = BaseRequestSchema.extend({
  from: InputSchema,
  to: InputSchema,
});

export const AreaRequestSchema = BaseRequestSchema.extend({
  geometry: InputSchema,
});

export const LengthRequestSchema = BaseRequestSchema.extend({
  geometry: InputSchema,
});

export const ContainsRequestSchema = BaseRequestSchema.extend({
  container: InputSchema,
  containee: InputSchema,
});

export const WithinRequestSchema = BaseRequestSchema.extend({
  geometry: InputSchema,
  target: InputSchema,
  radius: z.number().positive('Radius must be positive'),
});

export const IntersectsRequestSchema = BaseRequestSchema.extend({
  geometry1: InputSchema,
  geometry2: InputSchema,
});

---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, security, validation, input-handling]
dependencies: []
---

# Insufficient GeoJSON Coordinate Validation

## Problem Statement

The Zod schema validates geometry type but uses `z.any()` for coordinates, allowing malformed or malicious coordinate arrays to reach PostGIS. This creates denial-of-service risk and potential for unexpected computation results.

**Why it matters:** Invalid inputs can crash PostGIS, exhaust memory, or produce unexpected attestations. Input validation is the first line of defense.

## Findings

### Source
- Security Sentinel Agent
- Data Integrity Guardian Agent

### Evidence/Location

File: `packages/compute-service/src/routes/distance.ts` (and all 6 route files)

Lines 14-17:
```typescript
const GeometrySchema = z.object({
  type: z.enum(['Point', 'MultiPoint', 'LineString', ...]),
  coordinates: z.any(),  // NO VALIDATION
}).passthrough();  // ALLOWS EXTRA PROPERTIES
```

### Impact

- Invalid coordinate arrays (strings, nulls, wrong dimensions) pass validation
- Malformed GeoJSON reaches PostGIS, which may fail silently or produce unexpected results
- A Point with coordinates `["malicious", "data"]` passes Zod validation
- Coordinate values outside valid ranges (longitude > 180, latitude > 90) not caught
- Memory exhaustion via extremely large coordinate arrays
- `.passthrough()` allows unexpected properties

## Proposed Solutions

### Option A: Comprehensive GeoJSON Validation (Recommended)
```typescript
const PositionSchema = z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90),   // latitude
  z.number().optional(),          // altitude (optional)
]);

const PointCoordinatesSchema = PositionSchema;
const LineStringCoordinatesSchema = z.array(PositionSchema).min(2);
const PolygonCoordinatesSchema = z.array(z.array(PositionSchema).min(4));

const GeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: PointCoordinatesSchema }),
  z.object({ type: z.literal('LineString'), coordinates: LineStringCoordinatesSchema }),
  z.object({ type: z.literal('Polygon'), coordinates: PolygonCoordinatesSchema }),
  // ... etc
]);
```

**Pros:** Full RFC 7946 compliance, catches all malformed inputs
**Cons:** More code, needs maintenance for all geometry types
**Effort:** Medium
**Risk:** Low

### Option B: Use Existing GeoJSON Validation Library
```typescript
import { geojsonSchema } from '@mapbox/geojson-validation';
```

**Pros:** Battle-tested, complete
**Cons:** May not integrate cleanly with Zod
**Effort:** Small
**Risk:** Low

### Option C: Validate in PostGIS Layer
Let PostGIS validate and catch errors gracefully.

**Pros:** PostGIS is authoritative on geometry validity
**Cons:** Errors happen deeper in stack, less helpful messages
**Effort:** Small
**Risk:** Medium

## Recommended Action

Option A - Implement comprehensive Zod schemas for each geometry type. Extract to shared schema file to avoid duplication.

## Technical Details

### Affected Files
- All route files under `packages/compute-service/src/routes/`
- New file: `packages/compute-service/src/validation/geometry.ts`

### Related Components
- Input resolver depends on validated input

### Database Changes
None

## Acceptance Criteria

- [ ] Invalid coordinates are rejected with helpful error message
- [ ] Coordinate bounds are validated (-180 to 180, -90 to 90)
- [ ] Array depth matches geometry type requirements
- [ ] Extremely large coordinate arrays are rejected (DoS protection)
- [ ] `.passthrough()` removed or restricted
- [ ] Add tests for malformed geometry rejection

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-27 | Identified in code review | Critical for security and reliability |

## Resources

- [RFC 7946 - GeoJSON Format](https://datatracker.ietf.org/doc/html/rfc7946)
- [Zod Discriminated Unions](https://zod.dev/?id=discriminated-unions)

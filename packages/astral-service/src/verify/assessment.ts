/**
 * CredibilityVector Builder
 *
 * Aggregates per-stamp measurements into multidimensional CredibilityVector.
 * No summary scores — applications apply their own policy logic.
 *
 * Mirrors the SDK's ProofsModule.computeDimensions() (same math, same output).
 */

import type { StampResult, CredibilityVector } from './types/index.js';

/**
 * Build a CredibilityVector from stamp results.
 *
 * Computes four dimensions from raw per-stamp measurements:
 * - spatial: distance statistics + within-radius fraction
 * - temporal: overlap statistics + fully-overlapping fraction
 * - validity: fractions of stamps passing each check
 * - independence: plugin diversity + spatial agreement
 */
export function buildCredibilityVector(stampResults: StampResult[]): CredibilityVector {
  const count = stampResults.length;
  const now = Math.floor(Date.now() / 1000);

  if (count === 0) {
    return emptyVector(now);
  }

  return {
    dimensions: {
      spatial: computeSpatialDimension(stampResults),
      temporal: computeTemporalDimension(stampResults),
      validity: computeValidityDimension(stampResults),
      independence: computeIndependenceDimension(stampResults),
    },
    stampResults,
    meta: {
      stampCount: count,
      evaluatedAt: now,
      evaluationMode: 'tee',
    },
  };
}

/**
 * Convert a fraction (0-1) to basis points (0-10000) for EAS encoding.
 */
export function toBasisPoints(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 10000);
}

// ============================================
// Dimension Computation
// ============================================

/** Max value for uint32 — used as sentinel when distance can't be computed */
const MAX_UINT32 = 4_294_967_295;

/** Clamp distance to uint32 range (Infinity → MAX_UINT32) */
function clampDistance(meters: number): number {
  if (!isFinite(meters)) return MAX_UINT32;
  return Math.round(Math.min(meters, MAX_UINT32));
}

function computeSpatialDimension(results: StampResult[]) {
  // Filter out stamps with Infinity distance (non-point geometries)
  const finite = results.filter((r) => isFinite(r.distanceMeters));

  if (finite.length === 0) {
    return { meanDistanceMeters: MAX_UINT32, maxDistanceMeters: MAX_UINT32, withinRadiusFraction: 0 };
  }

  const distances = finite.map((r) => r.distanceMeters);
  const meanDistanceMeters = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const maxDistanceMeters = Math.max(...distances);
  const withinRadiusFraction = results.filter((r) => r.withinRadius).length / results.length;

  return {
    meanDistanceMeters: clampDistance(meanDistanceMeters),
    maxDistanceMeters: clampDistance(maxDistanceMeters),
    withinRadiusFraction,
  };
}

function computeTemporalDimension(results: StampResult[]) {
  const overlaps = results.map((r) => r.temporalOverlap);
  const meanOverlap = overlaps.reduce((sum, o) => sum + o, 0) / overlaps.length;
  const minOverlap = Math.min(...overlaps);
  const fullyOverlappingFraction =
    results.filter((r) => r.temporalOverlap >= 1.0).length / results.length;

  return { meanOverlap, minOverlap, fullyOverlappingFraction };
}

function computeValidityDimension(results: StampResult[]) {
  const count = results.length;
  return {
    signaturesValidFraction: results.filter((r) => r.signaturesValid).length / count,
    structureValidFraction: results.filter((r) => r.structureValid).length / count,
    signalsConsistentFraction: results.filter((r) => r.signalsConsistent).length / count,
  };
}

function computeIndependenceDimension(results: StampResult[]) {
  const pluginNames = [...new Set(results.map((r) => r.plugin))];
  const uniquePluginRatio = pluginNames.length / results.length;

  // Spatial agreement: fraction of stamps that agree on within-radius
  // (i.e., most common within-radius value as a fraction)
  const withinCount = results.filter((r) => r.withinRadius).length;
  const outsideCount = results.length - withinCount;
  const spatialAgreement = Math.max(withinCount, outsideCount) / results.length;

  return { uniquePluginRatio, spatialAgreement, pluginNames };
}

function emptyVector(evaluatedAt: number): CredibilityVector {
  return {
    dimensions: {
      spatial: { meanDistanceMeters: MAX_UINT32, maxDistanceMeters: MAX_UINT32, withinRadiusFraction: 0 },
      temporal: { meanOverlap: 0, minOverlap: 0, fullyOverlappingFraction: 0 },
      validity: { signaturesValidFraction: 0, structureValidFraction: 0, signalsConsistentFraction: 0 },
      independence: { uniquePluginRatio: 0, spatialAgreement: 0, pluginNames: [] },
    },
    stampResults: [],
    meta: { stampCount: 0, evaluatedAt, evaluationMode: 'tee' },
  };
}

/**
 * RTT-Anchor Signals Schema
 *
 * Vendored contract for the observation JSON emitted by plugin-rtt-anchor's
 * attester (`-json -raw`). The upstream repo is unstable, so this schema is
 * pinned to a specific commit: field names, units, and semantics are taken
 * from the `observation` struct in cmd/attester/main.go at that commit.
 *
 * Strict by design — an unknown or missing field fails verification loudly
 * rather than passing silently, so upstream drift surfaces here instead of
 * corrupting downstream evaluation.
 */

import { z } from 'zod';

/**
 * Upstream commit of github.com/location-proofs/plugin-rtt-anchor that this
 * plugin's signals schema and wire-format parser were written against.
 * Bump deliberately: re-derive schema.ts and wire.ts from the new commit.
 */
export const UPSTREAM_COMMIT = 'a1a1133015fe75ffee286fe5955b76ad2482586d';

const HexKey32 = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected 32-byte lowercase hex Ed25519 public key');

const Base64 = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Expected base64');

/**
 * One entry of the observation's `offsets` array (offsetView in Go).
 * Offset chains are one deep in this deployment; entries are recorded
 * but not independently re-verified by this plugin.
 */
export const RttAnchorOffsetSchema = z
  .object({
    authority: z.string(),
    sender: z.string(),
    lat: z.number(),
    lon: z.number(),
    rtt_ns: z.number().int().nonnegative(),
    valid: z.boolean(),
  })
  .strict();

/**
 * The attester's observation object, carried verbatim in stamp.signals.
 *
 * reply0_raw / reply1_raw are `omitempty` upstream (only present with -raw)
 * but are REQUIRED here: the anchor-signed bytes are the actual evidence,
 * and every other field is just a reading of them.
 */
export const RttAnchorSignalsSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    timestamp: z.string().min(1),

    anchor_key: HexKey32,
    attester_key: HexKey32,

    anchor_measured_rtt_ns: z.number().int().nonnegative(),
    anchor_measured_rtt_s: z.number().nonnegative(),
    attester_measured_rtt_ns: z.number().int().nonnegative(),

    challenged: z.boolean(),

    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),

    provable_max_distance_m: z.number().nonnegative(),
    calibrated_distance_m: z.number().nonnegative(),

    observed_at: z.string().optional(),

    reply0_valid: z.boolean(),
    reply1_valid: z.boolean(),
    anchor_key_match: z.boolean(),

    reply0_raw: Base64,
    reply1_raw: Base64,

    offsets: z.array(RttAnchorOffsetSchema).optional(),
    error: z.string().optional(),
  })
  .strict();

export type RttAnchorSignals = z.infer<typeof RttAnchorSignalsSchema>;

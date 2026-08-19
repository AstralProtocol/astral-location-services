/**
 * RTT-anchor test fixtures.
 *
 * Builds observations with real Ed25519 keypairs and byte-faithful reply
 * packets per internal/signed/packet.go upstream (big-endian headers,
 * signature over all preceding bytes). Field names and units follow the
 * attester's `observation` struct — synthetic measurements, real crypto.
 */

import { generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import type { LocationStamp } from '../../src/verify/types/index.js';
import type { RttAnchorSignals } from '../../src/verify/plugins/rtt-anchor/schema.js';
import { signStamp } from './verify.js';

const SRS = 'EPSG:4326';
const now = Math.floor(Date.now() / 1000);

const PROBE_SIZE = 108;
const REPLY_HEADER_SIZE = 213;
const SIGNATURE_SIZE = 64;
const CHALLENGED_BIT = 0x80;
const C_VACUUM_MPS = 299_792_458;

interface Ed25519Pair {
  privateKey: KeyObject;
  /** Raw 32-byte public key (last 32 bytes of the DER SPKI export) */
  publicRaw: Buffer;
}

function generatePair(): Ed25519Pair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return { privateKey, publicRaw: Buffer.from(der.subarray(der.length - 32)) };
}

/** Probe packet: Seq(4) Sec(4) Frac(4) SenderPubkey(32), signed over bytes 0:44. */
function buildProbe(seq: number, secFrac: bigint, sender: Ed25519Pair): Buffer {
  const buf = Buffer.alloc(PROBE_SIZE);
  buf.writeUInt32BE(seq, 0);
  buf.writeUInt32BE(Number(secFrac >> 32n), 4);
  buf.writeUInt32BE(Number(secFrac & 0xffffffffn), 8);
  sender.publicRaw.copy(buf, 12);
  const sig = cryptoSign(null, buf.subarray(0, 44), sender.privateKey);
  sig.copy(buf, 44);
  return buf;
}

interface ReplyFields {
  probe: Buffer;
  anchor: Ed25519Pair;
  measurementSlot: bigint;
  lat: number;
  lng: number;
  sinceLastRxNs: bigint;
  rttNs: bigint;
  challenged: boolean;
}

/** Reply packet with zero offsets (277 bytes), anchor-signed over the header. */
function buildReply(f: ReplyFields): Buffer {
  const buf = Buffer.alloc(REPLY_HEADER_SIZE + SIGNATURE_SIZE);
  f.probe.copy(buf, 0);
  f.anchor.publicRaw.copy(buf, 108); // AuthorityPubkey signs the reply
  f.anchor.publicRaw.copy(buf, 140); // GeoprobePubkey — same key in single-key anchors
  buf.writeBigUInt64BE(f.measurementSlot, 172);
  buf.writeDoubleBE(f.lat, 180);
  buf.writeDoubleBE(f.lng, 188);
  buf.writeBigUInt64BE(f.sinceLastRxNs, 196);
  buf.writeBigUInt64BE(f.rttNs, 204);
  buf[212] = f.challenged ? CHALLENGED_BIT : 0;
  const sig = cryptoSign(null, buf.subarray(0, REPLY_HEADER_SIZE), f.anchor.privateKey);
  sig.copy(buf, REPLY_HEADER_SIZE);
  return buf;
}

export interface ObservationFixture {
  signals: RttAnchorSignals;
  anchorKeyHex: string;
  attesterKeyHex: string;
  lat: number;
  lon: number;
}

export interface ObservationOverrides {
  challenged?: boolean;
  /** Break the reply0-nonce → probe1-echo linkage while keeping challenged set */
  breakNonceLinkage?: boolean;
  rttNs?: bigint;
  lat?: number;
  lon?: number;
}

/**
 * Build a complete, internally consistent observation: a challenged probe
 * pair against an anchor at the given position, with valid signatures and
 * derived fields computed exactly as the attester does.
 */
export function buildObservation(overrides: ObservationOverrides = {}): ObservationFixture {
  const anchor = generatePair();
  const attester = generatePair();

  const lat = overrides.lat ?? 51.5074;
  const lon = overrides.lon ?? -0.1278;
  const challenged = overrides.challenged ?? true;
  const rttNs = overrides.rttNs ?? 12_418_000n; // ~12.4ms, ~1861km bound
  const nonce = 0x1122334455667788n;
  const observedNs = BigInt(now) * 1_000_000_000n;

  const probe0 = buildProbe(1, 0xe70000ff00000000n, attester); // NTP-style timestamp
  const reply0 = buildReply({
    probe: probe0,
    anchor,
    measurementSlot: observedNs,
    lat,
    lng: lon,
    sinceLastRxNs: nonce, // reply 0 carries the challenge nonce
    rttNs: 0n,
    challenged: false,
  });

  const echoedNonce = overrides.breakNonceLinkage ? nonce + 1n : nonce;
  const probe1 = buildProbe(1, challenged ? echoedNonce : 0xe70000ff00000001n, attester);
  const reply1 = buildReply({
    probe: probe1,
    anchor,
    measurementSlot: observedNs,
    lat,
    lng: lon,
    sinceLastRxNs: rttNs, // reply 1 carries the anchor-measured interval
    rttNs,
    challenged,
  });

  const rttNumber = Number(rttNs);
  const signals: RttAnchorSignals = {
    seq: 1,
    timestamp: new Date(now * 1000).toISOString(),
    anchor_key: anchor.publicRaw.toString('hex'),
    attester_key: attester.publicRaw.toString('hex'),
    anchor_measured_rtt_ns: rttNumber,
    anchor_measured_rtt_s: rttNumber / 1e9,
    attester_measured_rtt_ns: rttNumber + 480_000,
    challenged,
    lat,
    lon,
    provable_max_distance_m: (rttNumber / 1e9 / 2) * C_VACUUM_MPS,
    calibrated_distance_m: (rttNumber / 1e9 / 2) * 0.69 * C_VACUUM_MPS / 1.25,
    observed_at: new Date(now * 1000).toISOString(),
    reply0_valid: true,
    reply1_valid: true,
    anchor_key_match: true,
    reply0_raw: reply0.toString('base64'),
    reply1_raw: reply1.toString('base64'),
  };

  return { signals, anchorKeyHex: signals.anchor_key, attesterKeyHex: signals.attester_key, lat, lon };
}

/**
 * Wrap an observation in a signed LocationStamp at the anchor position.
 */
export function makeRttAnchorStamp(fixture: ObservationFixture): LocationStamp {
  return signStamp(
    {
      lpVersion: '0.2',
      locationType: 'geojson-point',
      location: { type: 'Point', coordinates: [fixture.lon, fixture.lat] },
      srs: SRS,
      temporalFootprint: { start: now - 120, end: now + 60 },
      plugin: 'rtt-anchor',
      pluginVersion: '0.1.0',
      signals: fixture.signals as unknown as Record<string, unknown>,
    },
    now - 30
  );
}

/**
 * Corrupt the anchor signature on reply1_raw (last byte flipped).
 */
export function tamperReply1Signature(signals: RttAnchorSignals): RttAnchorSignals {
  const buf = Buffer.from(signals.reply1_raw, 'base64');
  buf[buf.length - 1] ^= 0xff;
  return { ...signals, reply1_raw: buf.toString('base64') };
}

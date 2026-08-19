/**
 * RTT-Anchor Wire Format
 *
 * Parses the anchor-signed reply bytes (reply0_raw / reply1_raw) and verifies
 * their Ed25519 signatures. Layout derived from internal/signed/packet.go at
 * UPSTREAM_COMMIT (see schema.ts):
 *
 *   Probe (108B):  Seq(4) Sec(4) Frac(4) SenderPubkey(32) Signature(64)
 *                  — signature by SenderPubkey over bytes 0:44
 *   Reply (277–1122B):
 *     0:108    Probe, echoed in full
 *     108:140  AuthorityPubkey (anchor signing key)
 *     140:172  GeoprobePubkey
 *     172:180  MeasurementSlot (Unix nanoseconds of the reference offset)
 *     180:188  Lat (float64)     188:196  Lng (float64)
 *     196:204  SinceLastRxNs (reply 0: challenge nonce; reply 1: measured RTT)
 *     204:212  RttNs (accumulated RTT from the reference position)
 *     212      NumOffsets bits 0–6, Challenged flag bit 7
 *     213:…    NumOffsets × 174-byte offset blobs
 *     last 64  Signature by AuthorityPubkey over everything preceding
 *
 * Multi-byte header fields are BIG-endian (binary.BigEndian in the Go code;
 * docs/protocol.md says little-endian but the code is authoritative — only
 * the Borsh offset blobs are little-endian).
 */

import { createPublicKey, verify as cryptoVerify } from 'node:crypto';

export const PROBE_PACKET_SIZE = 108;
export const LOCATION_OFFSET_SIZE = 174;
export const REPLY_HEADER_SIZE = 213;
export const SIGNATURE_SIZE = 64;
export const MIN_REPLY_PACKET_SIZE = REPLY_HEADER_SIZE + SIGNATURE_SIZE; // 277
const MAX_OFFSETS = 5;
const PROBE_PAYLOAD_SIZE = 44;
const CHALLENGED_BIT = 0x80;
const OFFSET_COUNT_MASK = 0x7f;

/** Speed of light in vacuum, m/s — basis of the provable support boundary. */
export const C_VACUUM_MPS = 299_792_458;

/**
 * Provable maximum distance for a round trip: halve and convert at vacuum c.
 * Mirrors geo.ProvableMaxDistance upstream.
 */
export function provableMaxDistanceM(rttNs: number): number {
  if (rttNs <= 0) return 0;
  return (rttNs / 1e9 / 2) * C_VACUUM_MPS;
}

// DER SPKI prefix for a raw Ed25519 public key (RFC 8410).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Verify an Ed25519 signature over message with a raw 32-byte public key.
 */
export function ed25519Verify(publicKey: Buffer, message: Buffer, signature: Buffer): boolean {
  if (publicKey.length !== 32 || signature.length !== SIGNATURE_SIZE) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey]),
      format: 'der',
      type: 'spki',
    });
    return cryptoVerify(null, message, key, signature);
  } catch {
    return false;
  }
}

export interface ParsedProbe {
  seq: number;
  /** Sec/Frac reassembled as one u64: an NTP timestamp on probe 0, the echoed nonce on a challenged probe 1 */
  secFrac: bigint;
  senderPubkey: Buffer;
  /** Ed25519 signature over bytes 0:44 verifies against senderPubkey */
  signatureValid: boolean;
}

export interface ParsedReply {
  probe: ParsedProbe;
  authorityPubkey: Buffer;
  geoprobePubkey: Buffer;
  /** Unix nanoseconds from the reference offset; 0 when absent */
  measurementSlot: bigint;
  lat: number;
  lng: number;
  sinceLastRxNs: bigint;
  rttNs: bigint;
  challenged: boolean;
  numOffsets: number;
  /** Ed25519 signature over all bytes preceding it verifies against authorityPubkey */
  signatureValid: boolean;
}

function parseProbe(buf: Buffer): ParsedProbe {
  const payload = buf.subarray(0, PROBE_PAYLOAD_SIZE);
  const signature = buf.subarray(44, PROBE_PACKET_SIZE);
  const senderPubkey = Buffer.from(buf.subarray(12, 44));
  return {
    seq: buf.readUInt32BE(0),
    secFrac: (BigInt(buf.readUInt32BE(4)) << 32n) | BigInt(buf.readUInt32BE(8)),
    senderPubkey,
    signatureValid: ed25519Verify(senderPubkey, Buffer.from(payload), Buffer.from(signature)),
  };
}

/**
 * Parse and signature-check one anchor-signed reply packet.
 * Returns null if the buffer is not a structurally valid reply.
 */
export function parseReply(buf: Buffer): ParsedReply | null {
  if (buf.length < MIN_REPLY_PACKET_SIZE) return null;

  const rawNumOffsets = buf[212];
  const challenged = (rawNumOffsets & CHALLENGED_BIT) !== 0;
  const numOffsets = rawNumOffsets & OFFSET_COUNT_MASK;
  if (numOffsets > MAX_OFFSETS) return null;

  const expectedSize = REPLY_HEADER_SIZE + numOffsets * LOCATION_OFFSET_SIZE + SIGNATURE_SIZE;
  if (buf.length !== expectedSize) return null;

  const authorityPubkey = Buffer.from(buf.subarray(108, 140));
  const payload = buf.subarray(0, buf.length - SIGNATURE_SIZE);
  const signature = buf.subarray(buf.length - SIGNATURE_SIZE);

  return {
    probe: parseProbe(buf.subarray(0, PROBE_PACKET_SIZE)),
    authorityPubkey,
    geoprobePubkey: Buffer.from(buf.subarray(140, 172)),
    measurementSlot: buf.readBigUInt64BE(172),
    lat: buf.readDoubleBE(180),
    lng: buf.readDoubleBE(188),
    sinceLastRxNs: buf.readBigUInt64BE(196),
    rttNs: buf.readBigUInt64BE(204),
    challenged,
    numOffsets,
    signatureValid: ed25519Verify(authorityPubkey, Buffer.from(payload), Buffer.from(signature)),
  };
}

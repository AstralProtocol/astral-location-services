'use client';

import { useState } from 'react';
import { createAstralCompute, createAstralEAS } from '@decentralized-geo/astral-compute';
import type { BooleanComputeResult, DelegatedAttestation } from '@decentralized-geo/astral-compute';
import { BrowserProvider } from 'ethers';

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
const SCHEMA_UID = process.env.NEXT_PUBLIC_RESOLVER_SCHEMA_UID ?? '';
const ZERO_REF = '0x0000000000000000000000000000000000000000000000000000000000000000';

function buildDelegatedAttestation(result: BooleanComputeResult): DelegatedAttestation {
  const att = result.attestation;
  const del = result.delegatedAttestation as { signature: string; attester: string; deadline: number; nonce?: number };
  const sig = att.signature.startsWith('0x') ? att.signature.slice(2) : att.signature;
  const r = '0x' + sig.slice(0, 64);
  const s = '0x' + sig.slice(64, 128);
  const v = parseInt(sig.slice(128, 130), 16);
  return {
    message: {
      schema: att.schema,
      recipient: att.recipient,
      expirationTime: 0n,
      revocable: true,
      refUID: ZERO_REF,
      data: att.data,
      value: 0n,
      nonce: BigInt(del.nonce ?? 0),
      deadline: BigInt(del.deadline),
    },
    signature: { v, r, s },
    attester: del.attester,
  };
}

export default function Home() {
  const [account, setAccount] = useState<string | null>(null);
  const [landmarkUid, setLandmarkUid] = useState('');
  const [status, setStatus] = useState<string>('');
  const [attestationUid, setAttestationUid] = useState<string | null>(null);

  async function connect() {
    const w = (window as unknown as { ethereum?: { request: (r: { method: string }) => Promise<string[]> }).ethereum;
    if (!w) {
      setStatus('No wallet found');
      return;
    }
    const accounts = await w.request({ method: 'eth_requestAccounts' });
    setAccount(accounts[0] ?? null);
    setStatus(accounts[0] ? 'Connected' : 'No account');
  }

  async function runWithinAndSubmit() {
    if (!account || !SCHEMA_UID) {
      setStatus('Connect wallet and set NEXT_PUBLIC_RESOLVER_SCHEMA_UID');
      return;
    }
    setStatus('Running within check...');
    try {
      const astral = createAstralCompute({
        apiUrl: process.env.NEXT_PUBLIC_ASTRAL_API_URL ?? 'https://api.astral.global',
        chainId: CHAIN_ID,
      });
      const userPoint = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };
      const targetUid = landmarkUid.trim() || '0x0000000000000000000000000000000000000000000000000000000000000000';
      const result = await astral.within(
        userPoint,
        targetUid,
        50_000,
        { schema: SCHEMA_UID, recipient: account }
      );
      setStatus(`Within 50km: ${result.result}`);

      if (result.result && result.delegatedAttestation) {
        setStatus('Submitting attestation onchain...');
        const provider = new BrowserProvider((window as unknown as { ethereum?: object }).ethereum!);
        const signer = await provider.getSigner();
        const eas = createAstralEAS(signer, CHAIN_ID);
        const delegated = buildDelegatedAttestation(result);
        const { uid } = await eas.submitDelegated(delegated);
        setAttestationUid(uid);
        setStatus(`Attestation submitted: ${uid}`);
      }
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Astral Location – Frontend Example</h1>
      {!account ? (
        <button type="button" onClick={connect}>Connect wallet</button>
      ) : (
        <p>Connected: {account.slice(0, 8)}…</p>
      )}
      <div style={{ marginTop: 16 }}>
        <label>Landmark attestation UID (optional): </label>
        <input
          value={landmarkUid}
          onChange={(e) => setLandmarkUid(e.target.value)}
          placeholder="0x..."
          style={{ width: 400, marginLeft: 8 }}
        />
      </div>
      <div style={{ marginTop: 16 }}>
        <button type="button" onClick={runWithinAndSubmit}>
          Run within(50km) and submit
        </button>
      </div>
      {status && <p style={{ marginTop: 16 }}>{status}</p>}
      {attestationUid && <p style={{ marginTop: 8, wordBreak: 'break-all' }}>UID: {attestationUid}</p>}
    </main>
  );
}

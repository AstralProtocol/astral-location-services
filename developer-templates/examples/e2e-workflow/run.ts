/**
 * End-to-end workflow: create/lookup inputs -> compute (within) -> get policy attestation.
 * Optionally submit delegated attestation onchain (requires PRIVATE_KEY and RPC).
 *
 * Usage:
 *   ASTRAL_API_URL=https://api.astral.global CHAIN_ID=84532 RESOLVER_SCHEMA_UID=0x... tsx run.ts
 *   With submit: PRIVATE_KEY=0x... RPC_URL=https://sepolia.base.org tsx run.ts
 */

import { createAstralCompute, createAstralEAS } from '@decentralized-geo/astral-compute';
import { Wallet, JsonRpcProvider } from 'ethers';

const apiUrl = process.env.ASTRAL_API_URL ?? 'https://api.astral.global';
const chainId = Number(process.env.CHAIN_ID ?? 84532);
const schemaUid = process.env.RESOLVER_SCHEMA_UID ?? '';

async function main() {
  if (!schemaUid) {
    console.log('Set RESOLVER_SCHEMA_UID to the boolean schema UID from your resolver registration.');
    process.exit(1);
  }

  const astral = createAstralCompute({ apiUrl, chainId });

  const userPoint = { type: 'Point' as const, coordinates: [-122.4194, 37.7749] };
  const landmarkPoint = { type: 'Point' as const, coordinates: [-122.42, 37.775] };

  console.log('Calling within(userPoint, landmarkPoint, 5000m)...');
  const result = await astral.within(
    userPoint,
    landmarkPoint,
    5000,
    { schema: schemaUid, recipient: '0x0000000000000000000000000000000000000000' }
  );

  console.log('Result:', result.result);
  console.log('Operation:', result.operation);
  console.log('Timestamp:', result.timestamp);
  console.log('InputRefs:', result.inputRefs);
  console.log('Attestation attester:', result.attestation?.attester);
  console.log('Delegated deadline:', result.delegatedAttestation?.deadline);

  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  if (privateKey && rpcUrl && result.result && result.delegatedAttestation) {
    console.log('\nSubmitting delegated attestation onchain...');
    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(privateKey, provider);
    const eas = createAstralEAS(signer, chainId);
    const del = result.delegatedAttestation as { signature: string; attester: string; deadline: number; nonce?: number };
    const att = result.attestation!;
    const sig = att.signature.startsWith('0x') ? att.signature.slice(2) : att.signature;
    const delegated = {
      message: {
        schema: att.schema,
        recipient: att.recipient,
        expirationTime: 0n,
        revocable: true,
        refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
        data: att.data,
        value: 0n,
        nonce: BigInt(del.nonce ?? 0),
        deadline: BigInt(del.deadline),
      },
      signature: { v: parseInt(sig.slice(128, 130), 16), r: '0x' + sig.slice(0, 64), s: '0x' + sig.slice(64, 128) },
      attester: del.attester,
    };
    const { uid } = await eas.submitDelegated(delegated);
    console.log('Attestation UID:', uid);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

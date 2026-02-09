/**
 * Round-trip test: compute → decode → verify sig → submit → read back.
 * Requires: PRIVATE_KEY and RPC_URL environment variables (or passed via options).
 */
import { ethers } from 'ethers';
import { SF_POINT, NYC_POINT, EAS_ADDRESS, EAS_ABI, TEST_CHAIN_ID } from '../lib/fixtures.mjs';
import { decodeNumericAttestation, SCALE_FACTORS } from '../lib/eas-schemas.mjs';
import { verifySignature } from '../lib/signature.mjs';
import { assertStatus, assertTrue, assertEqual } from '../lib/assertions.mjs';

export function suite(client, options = {}) {
  const privateKey = options.privateKey || (typeof process !== 'undefined' ? process.env?.PRIVATE_KEY : undefined);
  const rpcUrl = options.rpcUrl || (typeof process !== 'undefined' ? process.env?.RPC_URL : undefined) || 'https://sepolia.base.org';
  const externalSigner = options.signer || null;

  return {
    name: 'round-trip',
    tests: [
      {
        name: 'full-round-trip',
        fn: async () => {
          if (!privateKey && !externalSigner) {
            return [{ pass: false, message: 'No wallet connected and PRIVATE_KEY not set — skipping round-trip test', details: {} }];
          }

          const assertions = [];
          const chainId = client.chainId || TEST_CHAIN_ID;

          // 1. Compute
          // Use the API client's default schema UID (registered on-chain)
          const res = await client.compute.distance(SF_POINT, NYC_POINT);
          assertions.push(assertStatus(res, 200));
          if (!res.ok) return assertions;

          // 2. Decode attestation data
          const decoded = decodeNumericAttestation(res.body.attestation.data);
          assertions.push(assertEqual(decoded.operation, 'distance', 'decoded operation'));

          const expectedCm = BigInt(Math.round(res.body.result * Number(SCALE_FACTORS.DISTANCE)));
          assertions.push({
            pass: decoded.result === expectedCm,
            message: `Decoded result matches: ${decoded.result}`,
            details: { decoded: decoded.result.toString(), expected: expectedCm.toString() },
          });

          // 3. Verify signature
          const recovered = verifySignature(res.body, chainId);
          const expectedAttester = res.body.delegatedAttestation.attester;
          assertions.push({
            pass: recovered.toLowerCase() === expectedAttester.toLowerCase(),
            message: `Signature verified: ${recovered}`,
            details: { recovered, expectedAttester },
          });

          // 4. Submit onchain — use external signer (wallet) or create from private key
          const { attestation, delegatedAttestation } = res.body;
          const sig = ethers.Signature.from(attestation.signature);

          let signer;
          if (externalSigner) {
            signer = externalSigner;
          } else {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            signer = new ethers.Wallet(privateKey, provider);
          }
          const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer);

          const tx = await eas.attestByDelegation({
            schema: attestation.schema,
            data: {
              recipient: attestation.recipient,
              expirationTime: 0n,
              revocable: true,
              refUID: '0x0000000000000000000000000000000000000000000000000000000000000000',
              data: attestation.data,
              value: 0n,
            },
            signature: { v: sig.v, r: sig.r, s: sig.s },
            attester: delegatedAttestation.attester,
            deadline: BigInt(delegatedAttestation.deadline),
          });

          const receipt = await tx.wait();
          assertions.push(assertTrue(receipt.status === 1, `tx confirmed in block ${receipt.blockNumber}`));

          // 5. Read back UID
          const event = receipt.logs.find(log => {
            try {
              return eas.interface.parseLog(log)?.name === 'Attested';
            } catch {
              return false;
            }
          });

          const uid = event ? eas.interface.parseLog(event).args.uid : null;
          assertions.push(assertTrue(uid !== null, `Attestation UID: ${uid}`));

          return assertions;
        },
      },
    ],
  };
}

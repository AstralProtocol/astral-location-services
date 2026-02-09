/**
 * Onchain submission tests.
 * Requires: PRIVATE_KEY and RPC_URL environment variables (or passed via options).
 */
import { ethers } from 'ethers';
import { SF_POINT, NYC_POINT, EAS_ADDRESS, EAS_ABI } from '../lib/fixtures.mjs';
import { assertStatus, assertTrue } from '../lib/assertions.mjs';

export function suite(client, options = {}) {
  const privateKey = options.privateKey || (typeof process !== 'undefined' ? process.env?.PRIVATE_KEY : undefined);
  const rpcUrl = options.rpcUrl || (typeof process !== 'undefined' ? process.env?.RPC_URL : undefined) || 'https://sepolia.base.org';
  const externalSigner = options.signer || null;

  return {
    name: 'onchain',
    tests: [
      {
        name: 'onchain-submit-distance',
        fn: async () => {
          if (!privateKey && !externalSigner) {
            return [{ pass: false, message: 'No wallet connected and PRIVATE_KEY not set — skipping onchain test', details: {} }];
          }

          // 1. Compute distance
          // Use the API client's default schema UID (registered on-chain)
          const res = await client.compute.distance(SF_POINT, NYC_POINT);

          const statusCheck = assertStatus(res, 200);
          if (!statusCheck.pass) return [statusCheck];

          // 2. Build delegated request
          const { attestation, delegatedAttestation } = res.body;
          const sig = ethers.Signature.from(attestation.signature);

          const delegatedRequest = {
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
          };

          // 3. Submit to chain — use external signer (wallet) or create from private key
          let signer;
          if (externalSigner) {
            signer = externalSigner;
          } else {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            signer = new ethers.Wallet(privateKey, provider);
          }
          const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, signer);

          const tx = await eas.attestByDelegation(delegatedRequest);
          const receipt = await tx.wait();

          // 4. Parse Attested event
          const event = receipt.logs.find(log => {
            try {
              return eas.interface.parseLog(log)?.name === 'Attested';
            } catch {
              return false;
            }
          });

          const uid = event ? eas.interface.parseLog(event).args.uid : null;

          return [
            assertTrue(receipt.status === 1, 'tx confirmed'),
            assertTrue(receipt.blockNumber > 0, `block ${receipt.blockNumber}`),
            assertTrue(uid !== null, `attestation UID: ${uid}`),
          ];
        },
      },
    ],
  };
}

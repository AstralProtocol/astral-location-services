/**
 * Full flow test: Compute → Sign → Submit to EAS
 *
 * Usage: PRIVATE_KEY=0x... node scripts/test-eas-submit.mjs
 */

import { ethers } from 'ethers';

// Configuration
const COMPUTE_API = process.env.ASTRAL_API_URL || 'http://localhost:3333';
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';

// Our registered schemas
const SCHEMAS = {
  numeric: '0x26294bed9838f59e73f11582bcd16703bf8cf3820d91b1cacda94db726cf5c8e',
  boolean: '0x128e991560d62a7b2d7ea16c82aa31345ac917097d550526780b30050674486f',
};

// EAS ABI (just attestByDelegation)
const EAS_ABI = [
  `function attestByDelegation(
    tuple(
      bytes32 schema,
      tuple(
        address recipient,
        uint64 expirationTime,
        bool revocable,
        bytes32 refUID,
        bytes data,
        uint256 value
      ) data,
      tuple(uint8 v, bytes32 r, bytes32 s) signature,
      address attester,
      uint64 deadline
    ) delegatedRequest
  ) external payable returns (bytes32)`,
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)',
];

async function computeDistance(from, to, schema, recipient) {
  const res = await fetch(COMPUTE_API + '/compute/distance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, schema, recipient }),
  });
  if (!res.ok) throw new Error('Compute failed: ' + await res.text());
  return res.json();
}

async function submitToEAS(eas, attestation) {
  const { message, signature, attester } = attestation;

  // Convert string values back to BigInt for the contract call
  const delegatedRequest = {
    schema: message.schema,
    data: {
      recipient: message.recipient,
      expirationTime: BigInt(message.expirationTime),
      revocable: message.revocable,
      refUID: message.refUID,
      data: message.data,
      value: BigInt(message.value),
    },
    signature: {
      v: signature.v,
      r: signature.r,
      s: signature.s,
    },
    attester: attester,
    deadline: BigInt(message.deadline),
  };

  const tx = await eas.attestByDelegation(delegatedRequest);
  return tx;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY required');
    process.exit(1);
  }

  console.log('=== Full Flow Test: Compute → EAS ===\n');

  // Setup
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, wallet);

  console.log('Wallet:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH');
  console.log('Compute API:', COMPUTE_API);
  console.log('');

  // Test geometries
  const SF = { type: 'Point', coordinates: [-122.4194, 37.7749] };
  const NYC = { type: 'Point', coordinates: [-73.9857, 40.7484] };

  // Step 1: Get signed attestation from compute service
  console.log('--- Step 1: Compute Distance ---');
  console.log('From: San Francisco');
  console.log('To: New York City');

  const result = await computeDistance(SF, NYC, SCHEMAS.numeric, wallet.address);

  console.log('Distance:', result.result.value.toLocaleString(), result.result.units);
  console.log('Attester (Astral):', result.attestation.attester);
  console.log('Recipient:', result.attestation.message.recipient);
  console.log('');

  // Step 2: Submit to EAS
  console.log('--- Step 2: Submit to EAS ---');
  console.log('Submitting delegated attestation...');

  const tx = await submitToEAS(eas, result.attestation);
  console.log('Tx hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);
  console.log('Gas used:', receipt.gasUsed.toString());

  // Get the attestation UID from the event
  const event = receipt.logs.find(log => {
    try {
      const parsed = eas.interface.parseLog(log);
      return parsed?.name === 'Attested';
    } catch {
      return false;
    }
  });

  if (event) {
    const parsed = eas.interface.parseLog(event);
    const uid = parsed.args.uid;
    console.log('');
    console.log('=== SUCCESS ===');
    console.log('Attestation UID:', uid);
    console.log('');
    console.log('View on EAS Explorer:');
    console.log('https://base-sepolia.easscan.org/attestation/view/' + uid);
  }
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});

/**
 * Manual test: Point-in-Polygon → Submit to Base Sepolia
 *
 * This script tests whether a point is inside a polygon using the
 * Astral compute service, then submits the attestation to Base Sepolia.
 *
 * Prerequisites:
 *   1. Compute service running: npm run dev (in packages/compute-service)
 *   2. .env file with PRIVATE_KEY set to a wallet with Base Sepolia ETH
 *
 * Usage:
 *   # From repo root:
 *   node scripts/test-contains-onchain.mjs
 *
 *   # Or with custom API URL:
 *   ASTRAL_API_URL=http://localhost:3000 node scripts/test-contains-onchain.mjs
 */

import { ethers } from 'ethers';

// Configuration
const COMPUTE_API = process.env.ASTRAL_API_URL || 'http://localhost:3000';
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';

// Registered boolean schema on Base Sepolia
// Schema: "bool result, bytes32[] inputRefs, uint64 timestamp, string operation"
const BOOLEAN_SCHEMA_UID = '0x128e991560d62a7b2d7ea16c82aa31345ac917097d550526780b30050674486f';

// EAS ABI (minimal - just what we need)
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
  'function getNonce(address account) view returns (uint256)',
];

// Test geometries - Golden Gate Park and a point inside it
const GOLDEN_GATE_PARK = {
  type: 'Polygon',
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7749],
    [-122.5108, 37.7749],
    [-122.5108, 37.7694], // Closed ring
  ]],
};

const POINT_IN_PARK = {
  type: 'Point',
  coordinates: [-122.48, 37.772],
};

const POINT_OUTSIDE_PARK = {
  type: 'Point',
  coordinates: [-122.42, 37.77], // Near but outside
};

/**
 * Call the compute service's contains endpoint
 */
async function computeContains(container, containee, schema, recipient) {
  const url = `${COMPUTE_API}/compute/v0/contains`;
  console.log(`Calling: ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ container, containee, schema, recipient, chainId: 84532 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Compute failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Submit delegated attestation to EAS contract
 */
async function submitToEAS(eas, attestation, delegatedAttestation) {
  // Parse the signature
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
    signature: {
      v: sig.v,
      r: sig.r,
      s: sig.s,
    },
    attester: delegatedAttestation.attester,
    deadline: BigInt(delegatedAttestation.deadline),
  };

  const tx = await eas.attestByDelegation(delegatedRequest);
  return tx;
}

async function main() {
  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY not set in environment');
    console.error('');
    console.error('Create a .env file in the repo root with:');
    console.error('  PRIVATE_KEY=0x...');
    console.error('');
    console.error('Make sure the wallet has Base Sepolia ETH for gas.');
    process.exit(1);
  }

  console.log('');
  console.log('===========================================');
  console.log('  Point-in-Polygon Test → Base Sepolia');
  console.log('===========================================');
  console.log('');

  // Setup wallet and provider
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, wallet);

  // Show configuration
  console.log('Configuration:');
  console.log(`  Wallet:      ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:     ${ethers.formatEther(balance)} ETH`);
  console.log(`  Compute API: ${COMPUTE_API}`);
  console.log(`  RPC:         ${RPC_URL}`);
  console.log(`  Schema:      ${BOOLEAN_SCHEMA_UID}`);
  console.log('');

  if (balance === 0n) {
    console.error('Warning: Wallet has no ETH. Get Base Sepolia ETH from a faucet.');
    console.error('  https://www.alchemy.com/faucets/base-sepolia');
    console.error('');
  }

  // Test 1: Point that should be INSIDE the polygon
  console.log('--- Test: Point Inside Polygon ---');
  console.log('Container: Golden Gate Park (polygon)');
  console.log('Containee: Point at [-122.48, 37.772]');
  console.log('');

  const resultInside = await computeContains(
    GOLDEN_GATE_PARK,
    POINT_IN_PARK,
    BOOLEAN_SCHEMA_UID,
    wallet.address
  );

  console.log(`Result: ${resultInside.result ? 'INSIDE (true)' : 'OUTSIDE (false)'}`);
  console.log(`Operation: ${resultInside.operation}`);
  console.log(`Timestamp: ${new Date(resultInside.timestamp * 1000).toISOString()}`);
  console.log(`Attester: ${resultInside.attestation.attester}`);
  console.log('');

  if (!resultInside.result) {
    console.log('Note: Expected result to be true (point is inside polygon)');
  }

  // Submit to EAS
  console.log('--- Submitting to Base Sepolia ---');
  console.log('Sending transaction...');

  const tx = await submitToEAS(eas, resultInside.attestation, resultInside.delegatedAttestation);
  console.log(`Tx hash: ${tx.hash}`);

  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();

  console.log(`Confirmed in block: ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
  console.log('');

  // Extract attestation UID from event logs
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

    console.log('===========================================');
    console.log('  SUCCESS!');
    console.log('===========================================');
    console.log('');
    console.log(`Attestation UID: ${uid}`);
    console.log('');
    console.log('View on EAS Explorer:');
    console.log(`  https://base-sepolia.easscan.org/attestation/view/${uid}`);
    console.log('');
    console.log('Decoded attestation data:');
    console.log(`  result: ${resultInside.result}`);
    console.log(`  operation: "contains"`);
    console.log(`  inputRefs: [${resultInside.inputRefs.join(', ')}]`);
    console.log(`  timestamp: ${resultInside.timestamp}`);
  } else {
    console.log('Transaction succeeded but could not find Attested event');
    console.log('Check the transaction on block explorer:');
    console.log(`  https://sepolia.basescan.org/tx/${tx.hash}`);
  }
}

main().catch(err => {
  console.error('');
  console.error('Failed:', err.message);
  if (err.message.includes('fetch')) {
    console.error('');
    console.error('Is the compute service running?');
    console.error('  cd packages/compute-service && npm run dev');
  }
  process.exit(1);
});

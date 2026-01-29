/**
 * Manual test: Point-in-Africa MultiPolygon → Submit to Base Sepolia
 *
 * Tests whether points are inside the Africa continent MultiPolygon.
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/test-africa-contains.mjs
 */

import { readFileSync } from 'fs';
import { ethers } from 'ethers';

// Configuration
const COMPUTE_API = process.env.ASTRAL_API_URL || 'http://localhost:3000';
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';
const CHAIN_ID = 84532;

// Registered boolean schema on Base Sepolia
const BOOLEAN_SCHEMA_UID = '0x128e991560d62a7b2d7ea16c82aa31345ac917097d550526780b30050674486f';

// EAS ABI
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

// Test points
const NAIROBI = {
  type: 'Point',
  coordinates: [36.8219, -1.2921], // Nairobi, Kenya - INSIDE Africa
};

const CAIRO = {
  type: 'Point',
  coordinates: [31.2357, 30.0444], // Cairo, Egypt - INSIDE Africa
};

const PARIS = {
  type: 'Point',
  coordinates: [2.3522, 48.8566], // Paris, France - OUTSIDE Africa
};

// Load Africa geometry
function loadAfricaGeometry() {
  const geojsonPath = new URL('../examples/geometries/africa.geojson', import.meta.url);
  const data = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  // Extract just the geometry from the Feature
  return data.geometry;
}

async function computeContains(container, containee, schema, recipient) {
  const url = `${COMPUTE_API}/compute/v0/contains`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ container, containee, schema, recipient, chainId: CHAIN_ID }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Compute failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function submitToEAS(eas, attestation, delegatedAttestation) {
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

async function testPoint(name, point, africa, eas, wallet, shouldSubmit = false) {
  console.log(`\n--- Testing: ${name} ---`);
  console.log(`Coordinates: [${point.coordinates.join(', ')}]`);

  const result = await computeContains(
    africa,
    point,
    BOOLEAN_SCHEMA_UID,
    wallet.address
  );

  const isInside = result.result;
  console.log(`Result: ${isInside ? 'INSIDE Africa ✓' : 'OUTSIDE Africa ✗'}`);

  if (shouldSubmit) {
    console.log('Submitting to Base Sepolia...');
    const tx = await submitToEAS(eas, result.attestation, result.delegatedAttestation);
    console.log(`Tx hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Confirmed in block: ${receipt.blockNumber}`);

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
      console.log(`\nAttestation UID: ${uid}`);
      console.log(`View: https://base-sepolia.easscan.org/attestation/view/${uid}`);
    }
  }

  return result;
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY not set');
    process.exit(1);
  }

  console.log('');
  console.log('===========================================');
  console.log('  Africa MultiPolygon Contains Test');
  console.log('===========================================');

  // Load Africa geometry
  console.log('\nLoading Africa MultiPolygon...');
  const africa = loadAfricaGeometry();
  console.log(`Geometry type: ${africa.type}`);
  console.log(`Number of polygons: ${africa.coordinates.length}`);

  // Setup wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, wallet);

  console.log(`\nWallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

  // Test 1: Nairobi (inside) - submit to chain
  await testPoint('Nairobi, Kenya', NAIROBI, africa, eas, wallet, true);

  // Test 2: Cairo (inside) - just verify locally
  await testPoint('Cairo, Egypt', CAIRO, africa, eas, wallet, false);

  // Test 3: Paris (outside) - just verify locally
  await testPoint('Paris, France', PARIS, africa, eas, wallet, false);

  console.log('\n===========================================');
  console.log('  Tests Complete!');
  console.log('===========================================\n');
}

main().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});

/**
 * Create Location Protocol attestations on Base Sepolia for testing.
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/create-test-attestation.mjs
 */

import { ethers } from 'ethers';

const RPC_URL = 'https://sepolia.base.org';
const EAS_ADDRESS = '0x4200000000000000000000000000000000000021';

// Location Protocol v0.2 schema - already registered on Base Sepolia
const SCHEMA_UID = '0x3902cc7b8e415eb1ed9ac496431c31c88023cdbde0821cbb81195a8bcf74fffd';

const EAS_ABI = [
  'function attest(tuple(bytes32 schema, tuple(address recipient, uint64 expirationTime, bool revocable, bytes32 refUID, bytes data, uint256 value) data) request) external payable returns (bytes32)',
];

const SF_POINT = JSON.stringify({ type: 'Point', coordinates: [-122.4194, 37.7749] });
const GG_PARK = JSON.stringify({
  type: 'Polygon',
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7849],
    [-122.5108, 37.7849],
    [-122.5108, 37.7694]
  ]]
});

function encodeLocationData(lpVersion, srs, locationType, location) {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'string', 'string', 'string'],
    [lpVersion, srs, locationType, location]
  );
}

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('PRIVATE_KEY required');
    process.exit(1);
  }

  console.log('===========================================');
  console.log('Create Location Protocol Test Attestations');
  console.log('===========================================\n');

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const eas = new ethers.Contract(EAS_ADDRESS, EAS_ABI, wallet);

  console.log('Wallet:', wallet.address);
  console.log('Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'ETH');
  console.log('Schema UID:', SCHEMA_UID);

  // Create Point attestation
  console.log('\n--- Creating Point Attestation ---');
  console.log('GeoJSON:', SF_POINT);

  const pointTx = await eas.attest({
    schema: SCHEMA_UID,
    data: {
      recipient: wallet.address,
      expirationTime: 0n,
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodeLocationData('0.2', 'EPSG:4326', 'point', SF_POINT),
      value: 0n,
    },
  });

  console.log('Tx:', pointTx.hash);
  const pointReceipt = await pointTx.wait();
  const pointLog = pointReceipt.logs.find(l => l.topics[0] === ethers.id('Attested(address,address,bytes32,bytes32)'));
  const pointUID = pointLog?.data.slice(0, 66); // First bytes32 in data is the UID
  console.log('Point UID:', pointUID);

  // Create Polygon attestation
  console.log('\n--- Creating Polygon Attestation ---');

  const polygonTx = await eas.attest({
    schema: SCHEMA_UID,
    data: {
      recipient: wallet.address,
      expirationTime: 0n,
      revocable: true,
      refUID: ethers.ZeroHash,
      data: encodeLocationData('0.2', 'EPSG:4326', 'polygon', GG_PARK),
      value: 0n,
    },
  });

  console.log('Tx:', polygonTx.hash);
  const polygonReceipt = await polygonTx.wait();
  const polygonLog = polygonReceipt.logs.find(l => l.topics[0] === ethers.id('Attested(address,address,bytes32,bytes32)'));
  const polygonUID = polygonLog?.data.slice(0, 66); // First bytes32 in data is the UID
  console.log('Polygon UID:', polygonUID);

  console.log('\n===========================================');
  console.log('SUCCESS!');
  console.log('===========================================');
  console.log('\nPoint UID:', pointUID);
  console.log('Polygon UID:', polygonUID);
  console.log('\nView attestations:');
  console.log('https://base-sepolia.easscan.org/attestation/view/' + pointUID);
  console.log('https://base-sepolia.easscan.org/attestation/view/' + polygonUID);
  console.log('\nTest command:');
  console.log(`TEST_UID=${pointUID} TEST_UID_2=${polygonUID} ASTRAL_API_URL=https://staging-api.astral.global node scripts/test-uid-resolution.mjs`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

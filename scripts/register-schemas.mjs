/**
 * Register Astral Policy Attestation schemas on EAS
 *
 * Usage: PRIVATE_KEY=0x... RPC_URL=https://sepolia.base.org node scripts/register-schemas.mjs
 */

import { ethers } from 'ethers';

// EAS Schema Registry on Base Sepolia
const SCHEMA_REGISTRY_ADDRESS = '0x4200000000000000000000000000000000000020';

// Our schemas
const SCHEMAS = {
  numeric: {
    name: 'NumericPolicyAttestation',
    schema: 'uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation',
  },
  boolean: {
    name: 'BooleanPolicyAttestation',
    schema: 'bool result, bytes32[] inputRefs, uint256 timestamp, string operation',
  },
};

// Schema Registry ABI (just the functions we need)
const SCHEMA_REGISTRY_ABI = [
  'function register(string schema, address resolver, bool revocable) external returns (bytes32)',
  'function getSchema(bytes32 uid) external view returns (tuple(bytes32 uid, address resolver, bool revocable, string schema))',
  'event Registered(bytes32 indexed uid, address indexed registerer, tuple(bytes32 uid, address resolver, bool revocable, string schema) schema)',
];

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';

  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  console.log('=== Astral Schema Registration ===\n');
  console.log('RPC:', rpcUrl);
  console.log('Schema Registry:', SCHEMA_REGISTRY_ADDRESS);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log('Wallet:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'ETH\n');

  if (balance === 0n) {
    console.error('Error: Wallet has no ETH for gas');
    process.exit(1);
  }

  const registry = new ethers.Contract(SCHEMA_REGISTRY_ADDRESS, SCHEMA_REGISTRY_ABI, wallet);

  const results = {};

  for (const [key, { name, schema }] of Object.entries(SCHEMAS)) {
    console.log(`--- Registering ${name} ---`);
    console.log('Schema:', schema);

    try {
      // Register with no resolver, revocable = true
      const tx = await registry.register(schema, ethers.ZeroAddress, true);
      console.log('Tx hash:', tx.hash);

      const receipt = await tx.wait();
      console.log('Confirmed in block:', receipt.blockNumber);

      // Get the UID from the Registered event
      const event = receipt.logs.find(log => {
        try {
          const parsed = registry.interface.parseLog(log);
          return parsed?.name === 'Registered';
        } catch {
          return false;
        }
      });

      if (event) {
        const parsed = registry.interface.parseLog(event);
        const uid = parsed.args[0];
        console.log('Schema UID:', uid);
        results[key] = uid;
      }

      console.log('');
    } catch (err) {
      // Check if schema already exists (will revert)
      if (err.message.includes('AlreadyExists')) {
        console.log('Schema already registered, computing UID...');
        // The UID is keccak256(schema, resolver, revocable)
        const uid = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['string', 'address', 'bool'],
            [schema, ethers.ZeroAddress, true]
          )
        );
        console.log('Schema UID:', uid);
        results[key] = uid;
        console.log('');
      } else {
        console.error('Error:', err.message);
        throw err;
      }
    }
  }

  console.log('=== Summary ===\n');
  console.log('Add these to your .env:\n');
  console.log(`NUMERIC_SCHEMA_UID=${results.numeric}`);
  console.log(`BOOLEAN_SCHEMA_UID=${results.boolean}`);
  console.log('\nOr use in code:\n');
  console.log(`const NUMERIC_SCHEMA = '${results.numeric}';`);
  console.log(`const BOOLEAN_SCHEMA = '${results.boolean}';`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});

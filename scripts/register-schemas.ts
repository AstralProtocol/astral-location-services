/**
 * Register Astral Policy Attestation schemas on EAS
 * Run with: npx tsx scripts/register-schemas.ts
 */

import { ethers } from 'ethers';

// Schema definitions from SPEC.md
const SCHEMAS = {
  numeric: {
    name: 'NumericPolicyAttestation',
    schema: 'uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation',
    description: 'Astral numeric policy attestation for distance, area, and length operations',
  },
  boolean: {
    name: 'BooleanPolicyAttestation',
    schema: 'bool result, bytes32[] inputRefs, uint256 timestamp, string operation',
    description: 'Astral boolean policy attestation for contains, within, and intersects operations',
  },
  verify: {
    name: 'VerifyAttestation',
    schema: 'bytes32 proofHash, uint32 meanDistanceMeters, uint32 maxDistanceMeters, uint16 withinRadiusBp, uint16 meanOverlapBp, uint16 minOverlapBp, uint16 signaturesValidBp, uint16 structureValidBp, uint16 signalsConsistentBp, uint16 uniquePluginRatioBp, uint8 stampCount',
    description: 'Astral verify attestation for verified location proof credibility vectors',
  },
};

// EAS Schema Registry addresses
const SCHEMA_REGISTRY_ADDRESSES: Record<number, string> = {
  84532: '0x4200000000000000000000000000000000000020', // Base Sepolia
  8453: '0x4200000000000000000000000000000000000020',  // Base Mainnet
  11155111: '0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0', // Sepolia
  1: '0xA7b39296258348C78294F95B872b282326A97BDF', // Ethereum Mainnet
};

// EAS Schema Registry ABI (minimal for registration)
const SCHEMA_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schema', type: 'string' },
      { name: 'resolver', type: 'address' },
      { name: 'revocable', type: 'bool' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'getSchema',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'uid', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'uid', type: 'bytes32' },
          { name: 'resolver', type: 'address' },
          { name: 'revocable', type: 'bool' },
          { name: 'schema', type: 'string' },
        ],
      },
    ],
  },
];

async function main() {
  const chainId = parseInt(process.env.CHAIN_ID || '84532');
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';

  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const registryAddress = SCHEMA_REGISTRY_ADDRESSES[chainId];
  if (!registryAddress) {
    console.error(`Error: No schema registry address for chain ${chainId}`);
    process.exit(1);
  }

  console.log(`\nRegistering schemas on chain ${chainId}...`);
  console.log(`Schema Registry: ${registryAddress}\n`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const registry = new ethers.Contract(registryAddress, SCHEMA_REGISTRY_ABI, wallet);

  console.log(`Deployer: ${wallet.address}\n`);

  const results: Record<string, string> = {};

  for (const [key, config] of Object.entries(SCHEMAS)) {
    console.log(`Registering ${config.name}...`);
    console.log(`  Schema: ${config.schema}`);

    try {
      const tx = await registry.register(
        config.schema,
        ethers.ZeroAddress, // No resolver
        true // Revocable
      );
      console.log(`  Transaction: ${tx.hash}`);

      const receipt = await tx.wait();

      // Get the schema UID from the event logs
      // The SchemaRegistered event has the UID as the first topic
      const schemaUid = receipt.logs[0]?.topics[1];

      if (schemaUid) {
        console.log(`  Schema UID: ${schemaUid}`);
        results[key] = schemaUid;
      } else {
        console.log('  Warning: Could not extract schema UID from logs');
      }

      console.log('');
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.message?.includes('AlreadyExists')) {
        console.log('  Schema already registered');
        // Try to compute the UID
        const schemaUid = computeSchemaUid(config.schema, ethers.ZeroAddress, true);
        console.log(`  Computed UID: ${schemaUid}`);
        results[key] = schemaUid;
      } else {
        console.error(`  Error: ${error.message}`);
      }
      console.log('');
    }
  }

  console.log('\n=== Schema UIDs ===');
  console.log(JSON.stringify(results, null, 2));

  console.log('\n=== For playground/src/App.tsx ===');
  console.log(`const DEFAULT_SCHEMA_UIDS = {`);
  console.log(`  numeric: '${results.numeric || 'TODO'}',`);
  console.log(`  boolean: '${results.boolean || 'TODO'}',`);
  console.log(`};`);
}

// Compute schema UID (same as EAS does)
function computeSchemaUid(schema: string, resolver: string, revocable: boolean): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'bool'],
      [schema, resolver, revocable]
    )
  );
}

main().catch(console.error);

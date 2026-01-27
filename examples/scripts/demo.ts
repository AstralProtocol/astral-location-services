/**
 * Astral Location Services Demo Script
 *
 * This script demonstrates the full flow:
 * 1. Connect to the Astral Compute Service
 * 2. Request a verifiable distance computation
 * 3. Submit the signed attestation to EAS
 *
 * Prerequisites:
 * - Astral Compute Service running locally (docker-compose up)
 * - Environment variables: PRIVATE_KEY, RPC_URL
 */

import { Wallet, JsonRpcProvider } from 'ethers';
import { createAstralCompute, createAstralEAS } from '@decentralized-geo/astral-compute';

// Example schema UIDs (these would be registered on EAS)
const NUMERIC_SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000001';
const BOOLEAN_SCHEMA_UID = '0x0000000000000000000000000000000000000000000000000000000000000002';

// Example geometries
const SAN_FRANCISCO = {
  type: 'Point' as const,
  coordinates: [-122.4194, 37.7749],
};

const NEW_YORK = {
  type: 'Point' as const,
  coordinates: [-73.9857, 40.7484],
};

const GOLDEN_GATE_PARK = {
  type: 'Polygon' as const,
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7749],
    [-122.5108, 37.7749],
    [-122.5108, 37.7694],
  ]],
};

async function main() {
  console.log('=== Astral Location Services Demo ===\n');

  // Configuration
  const apiUrl = process.env.ASTRAL_API_URL || 'http://localhost:3000';
  const chainId = parseInt(process.env.CHAIN_ID || '84532', 10);
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;

  // Initialize Astral Compute client
  const astral = createAstralCompute({ apiUrl, chainId });
  console.log(`Connected to Astral Compute Service at ${apiUrl}`);
  console.log(`Chain ID: ${chainId}\n`);

  // Get recipient address
  let recipientAddress = '0x0000000000000000000000000000000000000001'; // Default for demo
  if (privateKey) {
    const wallet = new Wallet(privateKey);
    recipientAddress = wallet.address;
    console.log(`Wallet address: ${recipientAddress}\n`);
  }

  // Demo 1: Distance computation
  console.log('--- Demo 1: Distance between SF and NYC ---');
  try {
    const distanceResult = await astral.distance(SAN_FRANCISCO, NEW_YORK, {
      schema: NUMERIC_SCHEMA_UID,
      recipient: recipientAddress,
    });

    console.log(`Distance: ${distanceResult.result.value.toLocaleString()} ${distanceResult.result.units}`);
    console.log(`Input refs: ${distanceResult.inputs.refs.join(', ')}`);
    console.log(`Attester: ${distanceResult.attestation.attester}`);
    console.log('Attestation signature obtained ✓\n');
  } catch (error) {
    console.error('Distance computation failed:', error);
  }

  // Demo 2: Area computation
  console.log('--- Demo 2: Area of Golden Gate Park ---');
  try {
    const areaResult = await astral.area(GOLDEN_GATE_PARK, {
      schema: NUMERIC_SCHEMA_UID,
      recipient: recipientAddress,
    });

    console.log(`Area: ${areaResult.result.value.toLocaleString()} ${areaResult.result.units}`);
    console.log('Attestation signature obtained ✓\n');
  } catch (error) {
    console.error('Area computation failed:', error);
  }

  // Demo 3: Contains check
  console.log('--- Demo 3: Does Golden Gate Park contain SF point? ---');
  try {
    const containsResult = await astral.contains(GOLDEN_GATE_PARK, SAN_FRANCISCO, {
      schema: BOOLEAN_SCHEMA_UID,
      recipient: recipientAddress,
    });

    console.log(`Contains: ${containsResult.result.value === 1 ? 'Yes' : 'No'}`);
    console.log('Attestation signature obtained ✓\n');
  } catch (error) {
    console.error('Contains check failed:', error);
  }

  // Demo 4: Within check (proximity)
  console.log('--- Demo 4: Is SF within 10km of Golden Gate Park? ---');
  try {
    const withinResult = await astral.within(SAN_FRANCISCO, GOLDEN_GATE_PARK, 10000, {
      schema: BOOLEAN_SCHEMA_UID,
      recipient: recipientAddress,
    });

    console.log(`Within 10km: ${withinResult.result.value === 1 ? 'Yes' : 'No'}`);
    console.log('Attestation signature obtained ✓\n');
  } catch (error) {
    console.error('Within check failed:', error);
  }

  // Demo 5: Submit attestation to EAS (requires wallet and RPC)
  if (privateKey && rpcUrl) {
    console.log('--- Demo 5: Submit attestation to EAS ---');
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      const wallet = new Wallet(privateKey, provider);
      const eas = createAstralEAS(wallet, chainId);

      console.log(`EAS contract: ${eas.getContractAddress()}`);

      // Compute a new attestation to submit
      const result = await astral.distance(SAN_FRANCISCO, NEW_YORK, {
        schema: NUMERIC_SCHEMA_UID,
        recipient: recipientAddress,
      });

      console.log('Submitting delegated attestation to EAS...');
      const receipt = await eas.submitDelegated(result.attestation);
      console.log(`Transaction hash: ${receipt.hash}`);
      console.log('Attestation submitted successfully ✓\n');
    } catch (error) {
      console.error('EAS submission failed:', error);
    }
  } else {
    console.log('--- Demo 5: EAS Submission (skipped) ---');
    console.log('Set PRIVATE_KEY and RPC_URL environment variables to enable\n');
  }

  console.log('=== Demo Complete ===');
}

main().catch(console.error);

/**
 * Test script for attestation UID resolution on staging.
 *
 * This tests the fix from PR #16: ability to pass attestation UIDs
 * instead of raw GeoJSON to compute endpoints.
 *
 * Usage:
 *   ASTRAL_API_URL=https://api-staging.astral.global node scripts/test-uid-resolution.mjs
 *
 * Or for local testing:
 *   node scripts/test-uid-resolution.mjs
 *
 * With a known UID:
 *   TEST_UID=0x... node scripts/test-uid-resolution.mjs
 */

const API_URL = process.env.ASTRAL_API_URL || 'http://localhost:3333';
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '84532'); // Base Sepolia

// Test schema and recipient (dummy values for testing)
const TEST_SCHEMA = '0xc2b013ecb68d59b28f5d301203ec630335d97c37b400b16b359db6972572e02a';
const TEST_RECIPIENT = '0x0000000000000000000000000000000000000001';

// Test geometries
const SF_POINT = { type: 'Point', coordinates: [-122.4194, 37.7749] };
const NYC_POINT = { type: 'Point', coordinates: [-73.9857, 40.7484] };

console.log('===========================================');
console.log('Astral Location Services - UID Resolution Test');
console.log('===========================================\n');
console.log('API URL:', API_URL);
console.log('Chain ID:', CHAIN_ID);
console.log('');

async function compute(endpoint, body) {
  const url = `${API_URL}/compute/v0/${endpoint}`;
  console.log(`  POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, schema: TEST_SCHEMA, recipient: TEST_RECIPIENT, chainId: CHAIN_ID }),
  });

  const text = await res.text();

  if (!res.ok) {
    let detail = text;
    try {
      const json = JSON.parse(text);
      detail = json.detail || json.message || text;
    } catch {}
    throw new Error(`API error (${res.status}): ${detail}`);
  }

  return JSON.parse(text);
}

async function testRawGeoJSON() {
  console.log('--- Test 1: Raw GeoJSON (baseline) ---');
  console.log('Computing distance from SF to NYC using raw GeoJSON...');

  const result = await compute('distance', {
    from: SF_POINT,
    to: NYC_POINT,
  });

  console.log('  Result:', result.result.toLocaleString(), result.units);
  console.log('  Operation:', result.operation);
  console.log('  Input refs:', result.inputRefs);
  console.log('  Has attestation:', !!result.attestation);
  console.log('  PASS: Raw GeoJSON works\n');

  return result;
}

async function testUIDResolution(uid, polygonUid) {
  console.log('--- Test 2: UID Resolution (Area of Polygon) ---');
  // Use polygon UID for area, fall back to provided UID
  const uidToUse = polygonUid || uid;
  console.log(`Testing UID: ${uidToUse}`);

  try {
    // Try to compute area using the UID as input
    const result = await compute('area', {
      geometry: { uid: uidToUse },
    });

    console.log('  Result:', result.result.toLocaleString(), result.units);
    console.log('  Operation:', result.operation);
    console.log('  Input ref (should be the UID):', result.inputRefs[0]);

    // Verify the input ref matches the UID
    if (result.inputRefs[0].toLowerCase() === uid.toLowerCase()) {
      console.log('  PASS: Input ref matches original UID\n');
    } else {
      console.log('  WARNING: Input ref does not match UID (might be a hash)\n');
    }

    return result;
  } catch (error) {
    console.log('  Error:', error.message);
    console.log('');
    throw error;
  }
}

async function testInvalidUID() {
  console.log('--- Test 3: Invalid UID handling ---');
  const fakeUID = '0x0000000000000000000000000000000000000000000000000000000000000001';
  console.log(`Testing with non-existent UID: ${fakeUID}`);

  try {
    await compute('area', {
      geometry: { uid: fakeUID },
    });
    console.log('  FAIL: Should have thrown an error\n');
    return false;
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Invalid')) {
      console.log('  Error (expected):', error.message);
      console.log('  PASS: Invalid UID correctly rejected\n');
      return true;
    }
    console.log('  Unexpected error:', error.message);
    console.log('  FAIL: Wrong error type\n');
    return false;
  }
}

async function testMalformedUID() {
  console.log('--- Test 4: Malformed UID handling ---');
  const badUID = '0xnotavaliduid';
  console.log(`Testing with malformed UID: ${badUID}`);

  try {
    await compute('area', {
      geometry: { uid: badUID },
    });
    console.log('  FAIL: Should have thrown an error\n');
    return false;
  } catch (error) {
    if (error.message.includes('Invalid') || error.message.includes('format')) {
      console.log('  Error (expected):', error.message);
      console.log('  PASS: Malformed UID correctly rejected\n');
      return true;
    }
    console.log('  Unexpected error:', error.message);
    console.log('  FAIL: Wrong error type\n');
    return false;
  }
}

async function testDistanceWithUIDs(uid1, uid2) {
  console.log('--- Test 5: Distance with UIDs ---');
  console.log(`Computing distance between two attestation UIDs...`);

  try {
    const result = await compute('distance', {
      from: { uid: uid1 },
      to: { uid: uid2 },
    });

    console.log('  Result:', result.result.toLocaleString(), result.units);
    console.log('  Input refs:', result.inputRefs);
    console.log('  PASS: Distance computed from UIDs\n');
    return result;
  } catch (error) {
    console.log('  Error:', error.message);
    console.log('');
    throw error;
  }
}

async function testMixedInputs(uid) {
  console.log('--- Test 6: Mixed inputs (UID + raw GeoJSON) ---');
  console.log('Computing distance from UID to raw GeoJSON...');

  try {
    const result = await compute('distance', {
      from: { uid },
      to: NYC_POINT,
    });

    console.log('  Result:', result.result.toLocaleString(), result.units);
    console.log('  Input refs:', result.inputRefs);
    console.log('  PASS: Mixed inputs work\n');
    return result;
  } catch (error) {
    console.log('  Error:', error.message);
    console.log('');
    throw error;
  }
}

async function main() {
  const testUID = process.env.TEST_UID;
  const testUID2 = process.env.TEST_UID_2;

  let passed = 0;
  let failed = 0;

  // Test 1: Always run - raw GeoJSON should work
  try {
    await testRawGeoJSON();
    passed++;
  } catch (error) {
    console.log('  FAIL:', error.message, '\n');
    failed++;
  }

  // Test 3: Invalid UID handling
  try {
    const ok = await testInvalidUID();
    if (ok) passed++;
    else failed++;
  } catch (error) {
    console.log('  FAIL:', error.message, '\n');
    failed++;
  }

  // Test 4: Malformed UID handling
  try {
    const ok = await testMalformedUID();
    if (ok) passed++;
    else failed++;
  } catch (error) {
    console.log('  FAIL:', error.message, '\n');
    failed++;
  }

  // Tests requiring a real UID
  if (testUID) {
    // Test 2: UID resolution (use polygon UID for area test)
    try {
      await testUIDResolution(testUID, testUID2);
      passed++;
    } catch (error) {
      console.log('  FAIL:', error.message, '\n');
      failed++;
    }

    // Test 6: Mixed inputs
    try {
      await testMixedInputs(testUID);
      passed++;
    } catch (error) {
      console.log('  FAIL:', error.message, '\n');
      failed++;
    }

    // Test 5: Distance with two UIDs (optional)
    if (testUID2) {
      try {
        await testDistanceWithUIDs(testUID, testUID2);
        passed++;
      } catch (error) {
        console.log('  FAIL:', error.message, '\n');
        failed++;
      }
    } else {
      console.log('--- Test 5: Skipped (set TEST_UID_2 to run) ---\n');
    }
  } else {
    console.log('--- Tests 2, 5, 6: Skipped ---');
    console.log('Set TEST_UID environment variable to test UID resolution.');
    console.log('');
    console.log('To find a valid Location Protocol attestation UID on Base Sepolia:');
    console.log('  1. Go to https://base-sepolia.easscan.org');
    console.log('  2. Find an attestation with Location Protocol schema');
    console.log('  3. Copy the UID and run:');
    console.log('     TEST_UID=0x... node scripts/test-uid-resolution.mjs');
    console.log('');
  }

  // Summary
  console.log('===========================================');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  console.log('===========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

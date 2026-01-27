// Direct API test for Astral Location Services
const API_URL = process.env.ASTRAL_API_URL || 'http://localhost:3333';

console.log('=== Astral Location Services Test ===\n');
console.log('API URL:', API_URL, '\n');

const SF = { type: 'Point', coordinates: [-122.4194, 37.7749] };
const NYC = { type: 'Point', coordinates: [-73.9857, 40.7484] };
const PARK = {
  type: 'Polygon',
  coordinates: [[
    [-122.5108, 37.7694],
    [-122.4534, 37.7694],
    [-122.4534, 37.7749],
    [-122.5108, 37.7749],
    [-122.5108, 37.7694]
  ]]
};

const SCHEMA = '0x0000000000000000000000000000000000000000000000000000000000000001';
const RECIPIENT = '0x0000000000000000000000000000000000000001';

async function compute(endpoint, body) {
  const res = await fetch(API_URL + '/compute/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, schema: SCHEMA, recipient: RECIPIENT }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('API error: ' + err);
  }
  return res.json();
}

async function main() {
  // Test 1: Distance
  console.log('--- Test 1: Distance SF to NYC ---');
  const d = await compute('distance', { from: SF, to: NYC });
  console.log('Distance:', d.result.value.toLocaleString(), d.result.units);
  console.log('Attester:', d.attestation.attester);
  console.log('Has signature:', !!d.attestation.signature.r);
  console.log('');

  // Test 2: Area
  console.log('--- Test 2: Area of Golden Gate Park ---');
  const a = await compute('area', { geometry: PARK });
  const hectares = (a.result.value / 10000).toFixed(1);
  console.log('Area:', a.result.value.toLocaleString(), a.result.units, '(' + hectares + ' hectares)');
  console.log('');

  // Test 3: Contains
  console.log('--- Test 3: Does park contain a point inside? ---');
  const pointInside = { type: 'Point', coordinates: [-122.48, 37.772] };
  const c = await compute('contains', { container: PARK, containee: pointInside });
  console.log('Contains:', c.result.value === 1 ? 'YES' : 'NO');
  console.log('');

  // Test 4: Within
  console.log('--- Test 4: Is SF within 5km of park? ---');
  const w = await compute('within', { point: SF, target: PARK, radius: 5000 });
  console.log('Within 5km:', w.result.value === 1 ? 'YES' : 'NO');
  console.log('');

  // Test 5: Intersects
  console.log('--- Test 5: Do two overlapping polygons intersect? ---');
  const PARK2 = {
    type: 'Polygon',
    coordinates: [[
      [-122.49, 37.77],
      [-122.46, 37.77],
      [-122.46, 37.78],
      [-122.49, 37.78],
      [-122.49, 37.77]
    ]]
  };
  const i = await compute('intersects', { geometry1: PARK, geometry2: PARK2 });
  console.log('Intersects:', i.result.value === 1 ? 'YES' : 'NO');
  console.log('');

  // Test 6: Length
  console.log('--- Test 6: Length of a line ---');
  const LINE = {
    type: 'LineString',
    coordinates: [[-122.4194, 37.7749], [-122.4294, 37.7849], [-122.4394, 37.7749]]
  };
  const l = await compute('length', { geometry: LINE });
  console.log('Length:', l.result.value.toLocaleString(), l.result.units);
  console.log('');

  console.log('=== All tests completed! ===');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Popup, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import type { TestResult, SuiteResult } from '../lib/use-tests';

import * as fixtures from '../../../lib/fixtures.mjs';

interface Props {
  results: SuiteResult[];
  selectedTest: TestResult | null;
}

// Cast fixtures to any to avoid GeoJSON type narrowing issues
const f = fixtures as any;

// Map fixture names to geometries for display
const FIXTURE_GEOMETRIES: Array<{ name: string; geometry: any; type: string }> = [
  { name: 'San Francisco', geometry: f.SF_POINT, type: 'point' },
  { name: 'New York City', geometry: f.NYC_POINT, type: 'point' },
  { name: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, type: 'polygon' },
  { name: 'Point in Park', geometry: f.POINT_IN_PARK, type: 'point' },
  { name: 'Point Near Park', geometry: f.POINT_NEAR_PARK, type: 'point' },
  { name: 'Overlapping Polygon', geometry: f.OVERLAPPING_POLYGON, type: 'polygon' },
  { name: 'Disjoint Polygon', geometry: f.DISJOINT_POLYGON, type: 'polygon' },
  { name: 'Simple Line', geometry: f.SIMPLE_LINE, type: 'line' },
];

const DEFAULT_CENTER: LatLngExpression = [37.77, -122.45];
const DEFAULT_ZOOM = 12;

function FlyToHandler({ selectedTest }: { selectedTest: TestResult | null }) {
  const map = useMap();

  React.useEffect(() => {
    if (!selectedTest) return;

    const name = selectedTest.name.toLowerCase();
    if (name.includes('sf') || name.includes('park') || name.includes('within') || name.includes('contains')) {
      map.flyTo([37.77, -122.48], 13, { duration: 0.5 });
    } else if (name.includes('nyc')) {
      map.flyTo([40.74, -73.98], 12, { duration: 0.5 });
    } else if (name.includes('antipodal')) {
      map.flyTo([0, 0], 2, { duration: 0.5 });
    }
  }, [selectedTest, map]);

  return null;
}

function getFeatureStyle(name: string, results: SuiteResult[]) {
  const allTests = results.flatMap(s => s.results);
  const lowerName = name.toLowerCase();

  const relatedTests = allTests.filter(t => {
    const testName = t.name.toLowerCase();
    if (lowerName.includes('golden gate') || lowerName.includes('park')) {
      return testName.includes('park') || testName.includes('contains') || testName.includes('area') || testName.includes('intersects');
    }
    if (lowerName.includes('san francisco') || lowerName.includes('sf')) {
      return testName.includes('sf') || testName.includes('within');
    }
    if (lowerName.includes('new york')) {
      return testName.includes('nyc') || testName.includes('sf-nyc');
    }
    return false;
  });

  if (relatedTests.length === 0) {
    return { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.3, weight: 2 };
  }

  const allPass = relatedTests.every(t => t.pass);
  if (allPass) {
    return { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.3, weight: 2 };
  }
  return { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.3, weight: 2 };
}

export function MapView({ results, selectedTest }: Props) {
  const features = useMemo(() => {
    return FIXTURE_GEOMETRIES.map(fg => ({
      type: 'Feature' as const,
      properties: { name: fg.name },
      geometry: fg.geometry,
    }));
  }, []);

  return (
    <div className="h-[300px] rounded-lg overflow-hidden border">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToHandler selectedTest={selectedTest} />
        {features.map((feature, i) => (
          <GeoJSON
            key={`${feature.properties.name}-${i}-${results.length}`}
            data={feature as any}
            style={() => getFeatureStyle(feature.properties.name, results)}
            pointToLayer={(_feature: any, latlng: any) => {
              return L.circleMarker(latlng, { radius: 6 });
            }}
          >
            <Popup>
              <strong>{feature.properties.name}</strong>
            </Popup>
          </GeoJSON>
        ))}
      </MapContainer>
    </div>
  );
}

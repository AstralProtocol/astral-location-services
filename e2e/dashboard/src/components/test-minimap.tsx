import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as fixtures from '../../../lib/fixtures.mjs';

const f = fixtures as any;

// ---------------------------------------------------------------------------
// Test name → geometry mapping
// ---------------------------------------------------------------------------

interface GeoEntry {
  label: string;
  geometry: any;
  color: string;
}

const COLORS = {
  a: '#3b82f6', // blue
  b: '#f97316', // orange
};

/** Map test names to the geometries they use */
const TEST_GEOMETRIES: Record<string, GeoEntry[]> = {
  // Distance
  'distance-sf-nyc': [
    { label: 'San Francisco', geometry: f.SF_POINT, color: COLORS.a },
    { label: 'New York City', geometry: f.NYC_POINT, color: COLORS.b },
  ],
  'distance-identical-points': [
    { label: 'San Francisco', geometry: f.SF_POINT, color: COLORS.a },
  ],
  'distance-close-points': [
    { label: 'Point A', geometry: f.CLOSE_POINT_A, color: COLORS.a },
    { label: 'Point B', geometry: f.CLOSE_POINT_B, color: COLORS.b },
  ],
  'distance-antipodal': [
    { label: 'Origin (0,0)', geometry: f.ANTIPODAL_POINT_A, color: COLORS.a },
    { label: 'Antipode (180,0)', geometry: f.ANTIPODAL_POINT_B, color: COLORS.b },
  ],
  // Area
  'area-golden-gate-park': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
  ],
  'area-polygon-with-hole': [
    { label: 'Polygon with Hole', geometry: f.POLYGON_WITH_HOLE, color: COLORS.a },
  ],
  'area-tiny-polygon': [
    { label: 'Tiny Polygon', geometry: f.TINY_POLYGON, color: COLORS.a },
  ],
  // Length
  'length-simple-line': [
    { label: 'Line', geometry: f.SIMPLE_LINE, color: COLORS.a },
  ],
  // Contains
  'contains-point-in-park': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
    { label: 'Point in Park', geometry: f.POINT_IN_PARK, color: COLORS.b },
  ],
  'contains-point-outside': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
    { label: 'Point Near Park', geometry: f.POINT_NEAR_PARK, color: COLORS.b },
  ],
  'contains-boundary-point': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
    { label: 'Boundary Point', geometry: f.POINT_ON_BOUNDARY, color: COLORS.b },
  ],
  // Within
  'within-sf-near-park-5km': [
    { label: 'San Francisco', geometry: f.SF_POINT, color: COLORS.b },
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
  ],
  'within-sf-near-park-1m': [
    { label: 'San Francisco', geometry: f.SF_POINT, color: COLORS.b },
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
  ],
  // Intersects
  'intersects-overlapping': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
    { label: 'Overlapping', geometry: f.OVERLAPPING_POLYGON, color: COLORS.b },
  ],
  'intersects-disjoint': [
    { label: 'Golden Gate Park', geometry: f.GOLDEN_GATE_PARK, color: COLORS.a },
    { label: 'Disjoint', geometry: f.DISJOINT_POLYGON, color: COLORS.b },
  ],
};

// ---------------------------------------------------------------------------
// Auto-fit bounds
// ---------------------------------------------------------------------------

function FitBounds({ entries }: { entries: GeoEntry[] }) {
  const map = useMap();

  useEffect(() => {
    const group = L.featureGroup();
    for (const e of entries) {
      const layer = L.geoJSON(e.geometry);
      group.addLayer(layer);
    }
    if (group.getLayers().length > 0) {
      map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 16, animate: false });
    }
  }, [entries, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  testName: string;
}

export function TestMinimap({ testName }: Props) {
  const entries = TEST_GEOMETRIES[testName];
  if (!entries) return null;

  const features = useMemo(
    () =>
      entries.map((e, i) => ({
        type: 'Feature' as const,
        properties: { label: e.label, color: e.color, idx: i },
        geometry: e.geometry,
      })),
    [entries],
  );

  return (
    <div className="space-y-1.5">
      <div className="h-[160px] rounded-lg overflow-hidden border border-border/60">
        <MapContainer
          center={[37.77, -122.45]}
          zoom={12}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <FitBounds entries={entries} />
          {features.map((feature, i) => (
            <GeoJSON
              key={`${testName}-${i}`}
              data={feature as any}
              style={() => ({
                color: feature.properties.color,
                fillColor: feature.properties.color,
                fillOpacity: 0.25,
                weight: 2,
              })}
              pointToLayer={(_f: any, latlng: any) =>
                L.circleMarker(latlng, {
                  radius: 7,
                  color: feature.properties.color,
                  fillColor: feature.properties.color,
                  fillOpacity: 0.6,
                  weight: 2,
                })
              }
            />
          ))}
        </MapContainer>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: e.color }}
            />
            <span className="text-[11px] text-muted-foreground">{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

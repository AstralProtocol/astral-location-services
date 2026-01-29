import { describe, it, expect } from 'vitest';
import {
  NUMERIC_POLICY_SCHEMA,
  BOOLEAN_POLICY_SCHEMA,
  UNITS,
  SCALE_FACTORS,
  scaleToUint256,
} from '../../../src/signing/schemas.js';

describe('Signing Schemas', () => {
  describe('Schema Definitions', () => {
    it('NUMERIC_POLICY_SCHEMA is correct', () => {
      expect(NUMERIC_POLICY_SCHEMA).toBe(
        'uint256 result, string units, bytes32[] inputRefs, uint256 timestamp, string operation'
      );
    });

    it('BOOLEAN_POLICY_SCHEMA is correct', () => {
      expect(BOOLEAN_POLICY_SCHEMA).toBe(
        'bool result, bytes32[] inputRefs, uint256 timestamp, string operation'
      );
    });
  });

  describe('UNITS', () => {
    it('has expected unit strings', () => {
      expect(UNITS.CENTIMETERS).toBe('centimeters');
      expect(UNITS.SQUARE_CENTIMETERS).toBe('square_centimeters');
      expect(UNITS.METERS).toBe('meters');
      expect(UNITS.SQUARE_METERS).toBe('square_meters');
    });
  });

  describe('SCALE_FACTORS', () => {
    it('DISTANCE scales meters to centimeters (100x)', () => {
      expect(SCALE_FACTORS.DISTANCE).toBe(100n);
    });

    it('AREA scales square meters to square centimeters (10000x)', () => {
      expect(SCALE_FACTORS.AREA).toBe(10000n);
    });

    it('LENGTH scales meters to centimeters (100x)', () => {
      expect(SCALE_FACTORS.LENGTH).toBe(100n);
    });
  });

  describe('scaleToUint256', () => {
    it('scales distance: 1 meter = 100 centimeters', () => {
      const result = scaleToUint256(1, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(100n);
    });

    it('scales distance: 4130000 meters = 413000000 centimeters (SF to NYC)', () => {
      const result = scaleToUint256(4130000, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(413000000n);
    });

    it('scales area: 1 square meter = 10000 square centimeters', () => {
      const result = scaleToUint256(1, SCALE_FACTORS.AREA);
      expect(result).toBe(10000n);
    });

    it('scales area: 4100000 sq meters (Golden Gate Park) = 41000000000 sq centimeters', () => {
      const result = scaleToUint256(4100000, SCALE_FACTORS.AREA);
      expect(result).toBe(41000000000n);
    });

    it('handles fractional values with rounding', () => {
      // 1.5 meters = 150 centimeters
      const result = scaleToUint256(1.5, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(150n);
    });

    it('rounds to nearest integer', () => {
      // 1.234 meters = 123.4 centimeters -> rounds to 123
      const result = scaleToUint256(1.234, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(123n);
    });

    it('rounds up at 0.5', () => {
      // 1.235 meters = 123.5 centimeters -> rounds to 124
      const result = scaleToUint256(1.235, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(124n);
    });

    it('handles zero', () => {
      const result = scaleToUint256(0, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(0n);
    });

    it('handles very small values', () => {
      // 0.001 meters = 0.1 centimeters -> rounds to 0
      const result = scaleToUint256(0.001, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(0n);
    });

    it('handles very large values', () => {
      // Earth circumference ~40,075,000 meters
      const result = scaleToUint256(40075000, SCALE_FACTORS.DISTANCE);
      expect(result).toBe(4007500000n);
    });
  });
});

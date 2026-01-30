import { describe, it, expect } from 'vitest';
import { decodeLocationAttestation, isSupportedChain, getSupportedChains } from '../../../src/services/eas-client.js';
import { AbiCoder } from 'ethers';

describe('EAS Client', () => {
  describe('decodeLocationAttestation', () => {
    it('decodes valid location attestation data', () => {
      const abiCoder = AbiCoder.defaultAbiCoder();
      const geometry = { type: 'Point', coordinates: [-122.4194, 37.7749] };

      const encoded = abiCoder.encode(
        ['string', 'string', 'string', 'string'],
        ['0.2', 'EPSG:4326', 'Point', JSON.stringify(geometry)]
      );

      const decoded = decodeLocationAttestation(encoded);

      expect(decoded.lpVersion).toBe('0.2');
      expect(decoded.srs).toBe('EPSG:4326');
      expect(decoded.locationType).toBe('Point');
      expect(JSON.parse(decoded.location)).toEqual(geometry);
    });

    it('decodes polygon geometry', () => {
      const abiCoder = AbiCoder.defaultAbiCoder();
      const polygon = {
        type: 'Polygon',
        coordinates: [[[-122.5, 37.7], [-122.4, 37.7], [-122.4, 37.8], [-122.5, 37.8], [-122.5, 37.7]]],
      };

      const encoded = abiCoder.encode(
        ['string', 'string', 'string', 'string'],
        ['0.2', 'EPSG:4326', 'Polygon', JSON.stringify(polygon)]
      );

      const decoded = decodeLocationAttestation(encoded);

      expect(decoded.locationType).toBe('Polygon');
      expect(JSON.parse(decoded.location)).toEqual(polygon);
    });

    it('throws on invalid data', () => {
      expect(() => decodeLocationAttestation('0x1234')).toThrow('Failed to decode location attestation data');
    });
  });

  describe('isSupportedChain', () => {
    it('returns true for Base Sepolia', () => {
      expect(isSupportedChain(84532)).toBe(true);
    });

    it('returns true for Base Mainnet', () => {
      expect(isSupportedChain(8453)).toBe(true);
    });

    it('returns true for Sepolia', () => {
      expect(isSupportedChain(11155111)).toBe(true);
    });

    it('returns true for Ethereum Mainnet', () => {
      expect(isSupportedChain(1)).toBe(true);
    });

    it('returns false for unsupported chains', () => {
      expect(isSupportedChain(999999)).toBe(false);
    });
  });

  describe('getSupportedChains', () => {
    it('returns array of supported chain IDs', () => {
      const chains = getSupportedChains();

      expect(chains).toContain(84532);  // Base Sepolia
      expect(chains).toContain(8453);   // Base Mainnet
      expect(chains).toContain(11155111); // Sepolia
      expect(chains).toContain(1);      // Ethereum Mainnet
    });
  });
});

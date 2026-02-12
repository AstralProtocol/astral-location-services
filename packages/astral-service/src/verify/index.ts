/**
 * Verify Module Exports
 *
 * Location verification functionality for Astral Location Services.
 */

// Main verifier functions
export { verifyStamp, verifyProof } from './verifier.js';

// Assessment utilities
export { buildCredibilityVector, toBasisPoints } from './assessment.js';

// Plugin system
export {
  initPluginRegistry,
  registerPlugin,
  getPlugin,
  hasPlugin,
  listPlugins,
  clearPluginRegistry,
} from './plugins/index.js';

// Verify types
export type { CredibilityVector, StampResult } from './types/index.js';

// Plugin types
export type {
  LocationProofPlugin,
  PluginMetadata,
  StampEvaluation,
} from './plugins/index.js';

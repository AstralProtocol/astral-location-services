/**
 * Verify Module Exports
 *
 * Location verification functionality for Astral Location Services.
 */

// Main verifier functions
export { verifyStamp, verifyProof } from './verifier.js';

// Assessment utilities
export {
  computeConfidence,
  buildCredibilityAssessment,
  scaleConfidenceToUint8,
} from './assessment.js';

// Correlation analysis
export { analyzeCorrelation } from './correlation.js';

// Plugin system
export {
  initPluginRegistry,
  registerPlugin,
  getPlugin,
  hasPlugin,
  listPlugins,
  clearPluginRegistry,
} from './plugins/index.js';

// Plugin types
export type {
  LocationProofPlugin,
  PluginMetadata,
  StampEvaluation,
} from './plugins/index.js';

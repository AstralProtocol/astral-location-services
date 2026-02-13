/**
 * Plugin Registry for Location Verification
 *
 * Manages registration and lookup of verification plugins.
 */

import type { LocationProofPlugin, PluginMetadata } from './interface.js';
import { getPluginMetadata } from './interface.js';
import { ProofModePlugin } from './proofmode/index.js';
import { WitnessChainPlugin } from './witnesschain/index.js';

// Plugin registry storage
const plugins = new Map<string, LocationProofPlugin>();

/**
 * Register a plugin in the registry.
 */
export function registerPlugin(plugin: LocationProofPlugin): void {
  if (plugins.has(plugin.name)) {
    console.warn(`Plugin '${plugin.name}' already registered, replacing...`);
  }
  plugins.set(plugin.name, plugin);
  console.log(`Registered plugin: ${plugin.name} v${plugin.version}`);
}

/**
 * Get a plugin by name.
 *
 * @throws Error if plugin not found
 */
export function getPlugin(name: string): LocationProofPlugin {
  const plugin = plugins.get(name);
  if (!plugin) {
    const available = Array.from(plugins.keys()).join(', ') || 'none';
    throw new Error(`Plugin '${name}' not found. Available plugins: ${available}`);
  }
  return plugin;
}

/**
 * Check if a plugin is registered.
 */
export function hasPlugin(name: string): boolean {
  return plugins.has(name);
}

/**
 * List all registered plugins.
 */
export function listPlugins(): PluginMetadata[] {
  return Array.from(plugins.values()).map(getPluginMetadata);
}

/**
 * Initialize the plugin registry with built-in plugins.
 * Call this at server startup.
 */
export function initPluginRegistry(): void {
  registerPlugin(new ProofModePlugin());
  registerPlugin(new WitnessChainPlugin());

  console.log(`Plugin registry initialized with ${plugins.size} plugin(s)`);
}

/**
 * Clear all plugins from the registry.
 * Primarily for testing.
 */
export function clearPluginRegistry(): void {
  plugins.clear();
}

// Re-export interface types
export type { LocationProofPlugin, PluginMetadata, StampEvaluation } from './interface.js';
export { getPluginMetadata } from './interface.js';

/**
 * Plugin Registry
 * Manages plugin registration, state, and lifecycle
 */

import { WebUIPlugin, PluginRegistry as IPluginRegistry, PluginState } from './types';

const STORAGE_KEY_PREFIX = 'dicoogle_plugin_';

class PluginRegistry implements IPluginRegistry {
  plugins: Map<string, WebUIPlugin> = new Map();
  pluginStates: Map<string, PluginState> = new Map();

  constructor() {
    this.loadStatesFromStorage();
  }

  /**
   * Load plugin states from localStorage
   * By default, plugins are enabled unless explicitly disabled
   */
  private loadStatesFromStorage(): void {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}states`);
      if (stored) {
        const states = JSON.parse(stored);
        for (const [id, state] of Object.entries(states)) {
          this.pluginStates.set(id, state as PluginState);
        }
      }
    } catch (error) {
      console.warn('Failed to load plugin states from storage:', error);
    }
  }

  /**
   * Save plugin states to localStorage
   */
  private saveStatesToStorage(): void {
    try {
      const states: Record<string, PluginState> = {};
      for (const [id, state] of this.pluginStates.entries()) {
        states[id] = state;
      }
      localStorage.setItem(`${STORAGE_KEY_PREFIX}states`, JSON.stringify(states));
    } catch (error) {
      console.warn('Failed to save plugin states to storage:', error);
    }
  }

  registerPlugin(plugin: WebUIPlugin): void {
    const pluginId = plugin.metadata.id;

    if (this.plugins.has(pluginId)) {
      console.warn(
        `Plugin with id "${pluginId}" is already registered. Skipping...`
      );
      return;
    }

    // Initialize plugin state if not exists
    if (!this.pluginStates.has(pluginId)) {
      this.pluginStates.set(pluginId, {
        pluginId,
        enabled: true,
        lastModified: Date.now(),
      });
      this.saveStatesToStorage();
    }

    this.plugins.set(pluginId, plugin);
    console.log(
      `Plugin "${plugin.metadata.name}" (${pluginId}) registered successfully`
    );
  }

  getPlugin(id: string): WebUIPlugin | undefined {
    return this.plugins.get(id);
  }

  getAllPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get only enabled plugins
   */
  getEnabledPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values()).filter((plugin) =>
      this.isPluginEnabled(plugin.metadata.id)
    );
  }

  /**
   * Get only disabled plugins
   */
  getDisabledPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin) => !this.isPluginEnabled(plugin.metadata.id)
    );
  }

  /**
   * Check if a plugin is enabled
   * Defaults to true if no state exists
   */
  isPluginEnabled(id: string): boolean {
    const state = this.pluginStates.get(id);
    return state ? state.enabled : true;
  }

  /**
   * Enable or disable a plugin
   * This does NOT call destroy() - that's handled by the caller if needed
   */
  setPluginEnabled(id: string, enabled: boolean): void {
    let state = this.pluginStates.get(id);
    if (!state) {
      state = {
        pluginId: id,
        enabled,
        lastModified: Date.now(),
      };
    } else {
      state.enabled = enabled;
      state.lastModified = Date.now();
    }
    this.pluginStates.set(id, state);
    this.saveStatesToStorage();

    const plugin = this.getPlugin(id);
    if (plugin) {
      console.log(
        `Plugin "${plugin.metadata.name}" (${id}) ${enabled ? 'enabled' : 'disabled'}`
      );
    }
  }

  /**
   * Get plugin state
   */
  getPluginState(id: string): PluginState | undefined {
    return this.pluginStates.get(id);
  }

  getPluginsByType<T extends keyof WebUIPlugin>(
    methodName: T
  ): Array<{ plugin: WebUIPlugin; method: any }> {
    const results = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (methodName in plugin && typeof plugin[methodName] === 'function') {
        results.push({
          plugin,
          method: plugin[methodName],
        });
      }
    }

    return results;
  }
}

// Global registry instance
export const pluginRegistry = new PluginRegistry();

/**
 * Export the registry for use throughout the app
 */
export { PluginRegistry };

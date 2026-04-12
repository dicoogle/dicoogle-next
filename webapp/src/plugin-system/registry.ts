/**
 * Plugin Registry
 * Manages plugin registration, state, and lifecycle
 */

import {
  WebUIPlugin,
  PluginRegistry as IPluginRegistry,
  PluginState,
  PluginMetadata,
} from "./types";

const STORAGE_KEY_PREFIX = "dicoogle_plugin_";
const STORAGE_VERSION_KEY = "dicoogle_plugin_version";
const CURRENT_VERSION = "1.1";

class PluginRegistry implements IPluginRegistry {
  plugins: Map<string, WebUIPlugin> = new Map();
  pluginStates: Map<string, PluginState> = new Map();
  // Store metadata separately to support config-based metadata
  pluginMetadata: Map<string, PluginMetadata> = new Map();

  constructor() {
    this.loadStatesFromStorage();
  }

  /**
   * Load plugin states from localStorage
   * By default, plugins are enabled unless explicitly disabled
   */
  private loadStatesFromStorage(): void {
    try {
      // Check version - clear state if version changed
      const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
      if (storedVersion !== CURRENT_VERSION) {
        console.log("Plugin system version changed - clearing old state");
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}states`);
        localStorage.setItem(STORAGE_VERSION_KEY, CURRENT_VERSION);
        return;
      }

      const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}states`);
      if (stored) {
        const states = JSON.parse(stored);
        for (const [id, state] of Object.entries(states)) {
          this.pluginStates.set(id, state as PluginState);
        }
      }
    } catch (error) {
      console.warn("Failed to load plugin states from storage:", error);
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
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}states`,
        JSON.stringify(states),
      );
    } catch (error) {
      console.warn("Failed to save plugin states to storage:", error);
    }
  }

  /**
   * Register a plugin with optional config metadata and default enabled state
   */
  registerPlugin(
    plugin: WebUIPlugin,
    configMetadata?: Partial<PluginMetadata>,
    defaultEnabled: boolean = true,
  ): void {
    // Merge config metadata with plugin metadata, preferring config
    const metadata: PluginMetadata = {
      id: configMetadata?.id || plugin.metadata?.id || "unknown",
      name: configMetadata?.name || plugin.metadata?.name || "Unknown Plugin",
      version: configMetadata?.version || plugin.metadata?.version || "1.0.0",
      description: configMetadata?.description || plugin.metadata?.description || "",
      author: configMetadata?.author || plugin.metadata?.author || "Unknown",
      type: configMetadata?.type || plugin.metadata?.type,
      apiVersion: configMetadata?.apiVersion || plugin.metadata?.apiVersion,
      dependencies: configMetadata?.dependencies || plugin.metadata?.dependencies || [],
      license: configMetadata?.license || plugin.metadata?.license,
    };

    const pluginId = metadata.id;

    if (this.plugins.has(pluginId)) {
      console.warn(
        `Plugin with id "${pluginId}" is already registered. Skipping...`
      );
      return;
    }

    // Store metadata separately
    this.pluginMetadata.set(pluginId, metadata);

    // Store plugin with metadata attached for backwards compatibility
    const pluginWithMetadata = {
      ...plugin,
      metadata,
    };

    // Initialize plugin state if not exists
    // Use defaultEnabled from config, but only if no user preference exists
    if (!this.pluginStates.has(pluginId)) {
      this.pluginStates.set(pluginId, {
        pluginId,
        enabled: defaultEnabled,
        lastModified: Date.now(),
      });
      this.saveStatesToStorage();
    }

    this.plugins.set(pluginId, pluginWithMetadata);

    const currentState = this.pluginStates.get(pluginId);
    const statusText = currentState?.enabled
      ? "registered successfully"
      : "registered (disabled by default)";
    console.log(`Plugin "${metadata.name}" (${pluginId}) ${statusText}`);
  }

  getPlugin(id: string): WebUIPlugin | undefined {
    return this.plugins.get(id);
  }

  getPluginMetadata(id: string): PluginMetadata | undefined {
    return this.pluginMetadata.get(id);
  }

  getAllPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get only enabled plugins
   */
  getEnabledPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values()).filter((plugin) =>
      this.isPluginEnabled(plugin.metadata!.id)
    );
  }

  /**
   * Get only disabled plugins
   */
  getDisabledPlugins(): WebUIPlugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin) => !this.isPluginEnabled(plugin.metadata!.id)
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
    const metadata = this.getPluginMetadata(id);
    if (plugin && metadata) {
      console.log(
        `Plugin "${metadata.name}" (${id}) ${enabled ? "enabled" : "disabled"}`,
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
    methodName: T,
  ): Array<{ plugin: WebUIPlugin; method: any }> {
    const results = [];

    for (const plugin of this.getEnabledPlugins()) {
      if (methodName in plugin && typeof plugin[methodName] === "function") {
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

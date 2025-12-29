/**
 * Plugin Manager
 * Handles plugin lifecycle management (initialization, enabling, disabling, cleanup)
 */

import { pluginRegistry } from './registry';
import { WebUIPlugin, PluginContext } from './types';
import DicoogleClient from 'dicoogle-client';

/**
 * Maps to track initialized plugins for cleanup
 */
const initializedPlugins = new Set<string>();

/**
 * Get the Dicoogle client instance
 * This creates a client that shares the same base URL and token as the main app
 */
function getDicoogleClient() {
  const getBaseUrl = (): string => {
    const envUrl = import.meta.env.VITE_API_BASE_URL;

    if (envUrl && envUrl.startsWith("/")) {
      const { protocol, hostname, port } = window.location;
      return `${protocol}//${hostname}${port ? ":" + port : ""}${envUrl}`;
    }

    if (envUrl && (envUrl.startsWith("http://") || envUrl.startsWith("https://"))) {
      return envUrl;
    }

    return "http://localhost:8080";
  };

  const DICOOGLE_URL = getBaseUrl();
  const client = DicoogleClient(DICOOGLE_URL);
  
  // Use the same token as the main app
  const token = localStorage.getItem('dicoogle_token');
  if (token) {
    client.setToken(token);
  }
  
  return client;
}

/**
 * Create a plugin context for initialization
 */
export function createPluginContext(pluginId?: string): PluginContext {
  const effectivePluginId = pluginId || 'unknown';
  
  return {
    appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
    logger: {
      log: (message: string, data?: any) =>
        console.log(`[Plugin:${effectivePluginId}] ${message}`, data),
      warn: (message: string, data?: any) =>
        console.warn(`[Plugin:${effectivePluginId}] ${message}`, data),
      error: (message: string, error?: any) =>
        console.error(`[Plugin:${effectivePluginId}] ${message}`, error),
      info: (message: string, data?: any) =>
        console.info(`[Plugin:${effectivePluginId}] ${message}`, data),
    },
    storage: {
      get: (key: string) => {
        try {
          // Scope storage to plugin ID
          const item = localStorage.getItem(`plugin_${effectivePluginId}_${key}`);
          return item ? JSON.parse(item) : null;
        } catch {
          return null;
        }
      },
      set: (key: string, value: any) => {
        try {
          // Scope storage to plugin ID
          localStorage.setItem(`plugin_${effectivePluginId}_${key}`, JSON.stringify(value));
        } catch (error) {
          console.warn(`Failed to set plugin storage: ${key}`, error);
        }
      },
      remove: (key: string) => {
        try {
          // Scope storage to plugin ID
          localStorage.removeItem(`plugin_${effectivePluginId}_${key}`);
        } catch (error) {
          console.warn(`Failed to remove plugin storage: ${key}`, error);
        }
      },
    },
    eventBus: createEventBus(),
    dicoogle: getDicoogleClient(),
  };
}

/**
 * Simple event bus implementation
 */
function createEventBus() {
  const listeners: Map<string, Set<Function>> = new Map();

  return {
    on: (event: string, callback: (data: any) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
    },
    off: (event: string, callback: (data: any) => void) => {
      listeners.get(event)?.delete(callback);
    },
    emit: (event: string, data: any) => {
      listeners.get(event)?.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error);
        }
      });
    },
  };
}

/**
 * Initialize a plugin
 * Calls the init() hook if defined
 */
export async function initializePlugin(
  pluginId: string,
  context?: PluginContext
): Promise<void> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  // Already initialized
  if (initializedPlugins.has(pluginId)) {
    return;
  }

  try {
    if (plugin.init) {
      const ctx = context || createPluginContext(pluginId);
      await plugin.init(ctx);
    }
    initializedPlugins.add(pluginId);
    console.log(`✓ Plugin initialized: ${plugin.metadata.name}`);
  } catch (error) {
    console.error(
      `✗ Failed to initialize plugin ${plugin.metadata.name}:`,
      error
    );
    throw error;
  }
}

/**
 * Cleanup a plugin
 * Calls the destroy() hook if defined
 */
export async function destroyPlugin(pluginId: string): Promise<void> {
  const plugin = pluginRegistry.getPlugin(pluginId);
  if (!plugin) {
    console.warn(`Plugin not found: ${pluginId}`);
    return;
  }

  try {
    if (plugin.destroy) {
      await plugin.destroy();
    }
    initializedPlugins.delete(pluginId);
    console.log(`✓ Plugin destroyed: ${plugin.metadata.name}`);
  } catch (error) {
    console.error(
      `✗ Failed to destroy plugin ${plugin.metadata.name}:`,
      error
    );
    throw error;
  }
}

/**
 * Enable a plugin
 * Initializes it if not already initialized
 */
export async function enablePlugin(
  pluginId: string,
  context?: PluginContext
): Promise<void> {
  pluginRegistry.setPluginEnabled(pluginId, true);
  await initializePlugin(pluginId, context);
  
  // Emit event to notify components to reload
  window.dispatchEvent(new CustomEvent('plugin-state-changed', { detail: { pluginId, enabled: true } }));
}

/**
 * Disable a plugin
 * Destroys it and cleans up resources
 */
export async function disablePlugin(pluginId: string): Promise<void> {
  await destroyPlugin(pluginId);
  pluginRegistry.setPluginEnabled(pluginId, false);
  
  // Emit event to notify components to reload
  window.dispatchEvent(new CustomEvent('plugin-state-changed', { detail: { pluginId, enabled: false } }));
}

/**
 * Initialize all enabled plugins
 */
export async function initializeAllPlugins(
  context?: PluginContext
): Promise<void> {
  const enabledPlugins = pluginRegistry.getEnabledPlugins();

  for (const plugin of enabledPlugins) {
    try {
      const ctx = context || createPluginContext(plugin.metadata.id);
      await initializePlugin(plugin.metadata.id, ctx);
    } catch (error) {
      console.error(
        `Failed to initialize plugin ${plugin.metadata.name}:`,
        error
      );
      // Continue initializing other plugins
    }
  }
}

/**
 * Cleanup all plugins
 */
export async function destroyAllPlugins(): Promise<void> {
  for (const pluginId of initializedPlugins) {
    try {
      await destroyPlugin(pluginId);
    } catch (error) {
      console.error(`Failed to destroy plugin ${pluginId}:`, error);
    }
  }
}

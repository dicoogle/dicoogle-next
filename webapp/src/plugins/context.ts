/**
 * Plugin Context Factory
 * Creates the context object passed to plugins during initialization
 */

import { PluginContext } from './types';

// Simple event bus implementation for plugin communication
class PluginEventBus {
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  emit(event: string, data: any): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Simple storage implementation for plugins
class PluginStorage {
  private data: Map<string, any> = new Map();

  get(key: string): any {
    return this.data.get(`plugin_${key}`);
  }

  set(key: string, value: any): void {
    this.data.set(`plugin_${key}`, value);
  }

  remove(key: string): void {
    this.data.delete(`plugin_${key}`);
  }
}

// Global event bus instance (shared across all plugins)
const globalEventBus = new PluginEventBus();

/**
 * Create a plugin context
 * This is passed to plugins during initialization
 */
export function createPluginContext(appVersion: string = '1.0.0'): PluginContext {
  return {
    appVersion,
    logger: {
      log: (message: string, data?: any) =>
        console.log(`[Plugin] ${message}`, data),
      warn: (message: string, data?: any) =>
        console.warn(`[Plugin] ${message}`, data),
      error: (message: string, error?: any) =>
        console.error(`[Plugin] ${message}`, error),
      info: (message: string, data?: any) =>
        console.info(`[Plugin] ${message}`, data),
    },
    storage: new PluginStorage(),
    eventBus: globalEventBus,
  };
}

/**
 * Initialize all plugins with the context
 * This should be called during app startup
 */
export async function initializePlugins(
  plugins: Array<{ init?: (context: PluginContext) => void | Promise<void> }>,
  appVersion: string = '1.0.0'
): Promise<void> {
  const context = createPluginContext(appVersion);

  for (const plugin of plugins) {
    if (plugin.init) {
      try {
        await plugin.init(context);
      } catch (error) {
        console.error('Error initializing plugin:', error);
      }
    }
  }
}

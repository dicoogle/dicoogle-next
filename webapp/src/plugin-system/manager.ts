/**
 * Plugin Manager
 * Handles plugin lifecycle management (initialization, enabling, disabling, cleanup)
 */

import { pluginRegistry } from "./registry";
import { PluginContext } from "./types";
import { createPluginContext, emitPluginStateChanged } from "./context";

/**
 * Maps to track initialized plugins for cleanup
 */
const initializedPlugins = new Set<string>();

function resolvePluginInitializationOrder(pluginIds: string[]): string[] {
  const idSet = new Set(pluginIds);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (pluginId: string, path: string[]) => {
    if (visited.has(pluginId)) {
      return;
    }

    if (visiting.has(pluginId)) {
      throw new Error(
        `Circular plugin dependency detected: ${[...path, pluginId].join(" -> ")}`,
      );
    }

    visiting.add(pluginId);

    const metadata = pluginRegistry.getPluginMetadata(pluginId);
    const dependencies = metadata?.dependencies || [];

    for (const depId of dependencies) {
      if (!idSet.has(depId)) {
        throw new Error(
          `Plugin "${pluginId}" depends on "${depId}", but it is missing or disabled`,
        );
      }
      visit(depId, [...path, pluginId]);
    }

    visiting.delete(pluginId);
    visited.add(pluginId);
    ordered.push(pluginId);
  };

  for (const pluginId of pluginIds) {
    visit(pluginId, []);
  }

  return ordered;
}

/**
 * Initialize a plugin
 * Calls the init() hook if defined
 */
export async function initializePlugin(
  pluginId: string,
  context?: PluginContext,
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
    const metadata = pluginRegistry.getPluginMetadata(pluginId);
    console.log(`✓ Plugin initialized: ${metadata?.name || pluginId}`);
  } catch (error) {
    const metadata = pluginRegistry.getPluginMetadata(pluginId);
    console.error(
      `✗ Failed to initialize plugin ${metadata?.name || pluginId}:`,
      error,
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
    const metadata = pluginRegistry.getPluginMetadata(pluginId);
    console.log(`✓ Plugin destroyed: ${metadata?.name || pluginId}`);
  } catch (error) {
    const metadata = pluginRegistry.getPluginMetadata(pluginId);
    console.error(
      `✗ Failed to destroy plugin ${metadata?.name || pluginId}:`,
      error,
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
  context?: PluginContext,
): Promise<void> {
  pluginRegistry.setPluginEnabled(pluginId, true);
  await initializePlugin(pluginId, context);
  emitPluginStateChanged(pluginId, true);
}

/**
 * Disable a plugin
 * Destroys it and cleans up resources
 */
export async function disablePlugin(pluginId: string): Promise<void> {
  await destroyPlugin(pluginId);
  pluginRegistry.setPluginEnabled(pluginId, false);
  emitPluginStateChanged(pluginId, false);
}

/**
 * Initialize all enabled plugins
 */
export async function initializeAllPlugins(
  context?: PluginContext,
): Promise<void> {
  const enabledPluginIds = pluginRegistry
    .getEnabledPlugins()
    .map((plugin) => plugin.metadata?.id || "unknown")
    .filter((pluginId) => pluginId !== "unknown");

  let orderedPluginIds: string[] = [];
  try {
    orderedPluginIds = resolvePluginInitializationOrder(enabledPluginIds);
  } catch (error) {
    console.error("Failed to resolve plugin initialization order:", error);
    orderedPluginIds = enabledPluginIds;
  }

  console.log(
    `\n🔌 Initializing ${orderedPluginIds.length} enabled plugin(s)...`,
  );

  for (const pluginId of orderedPluginIds) {
    try {
      const ctx = context || createPluginContext(pluginId);
      await initializePlugin(pluginId, ctx);
    } catch (error) {
      const metadata = pluginRegistry.getPluginMetadata(pluginId);
      console.error(
        `Failed to initialize plugin ${metadata?.name || pluginId}:`,
        error,
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

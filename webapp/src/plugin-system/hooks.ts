/**
 * Plugin Hooks and Context
 * Provides utilities for plugin interaction and React hooks
 */

import { useEffect, useState, useCallback } from "react";
import { pluginRegistry } from "./registry";
import {
  RouteExtension,
  SidebarMenuExtension,
  WebUIPlugin,
  PluginState,
  PluginContext,
} from "./types";
import { enablePlugin, disablePlugin } from "./manager";
import { dicoogleService } from "@/services/dicoogleService";

/**
 * Hook to create plugin context
 * This provides the context object that plugins receive
 */
export function usePluginContext(): PluginContext {
  return {
    appVersion: "1.0.0",
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
    storage: {
      get: (key: string) => {
        try {
          const data = localStorage.getItem(`plugin_${key}`);
          return data ? JSON.parse(data) : undefined;
        } catch {
          return undefined;
        }
      },
      set: (key: string, value: any) => {
        try {
          localStorage.setItem(`plugin_${key}`, JSON.stringify(value));
        } catch (error) {
          console.error("Failed to set plugin storage:", error);
        }
      },
      remove: (key: string) => {
        localStorage.removeItem(`plugin_${key}`);
      },
    },
    eventBus: {
      on: (event: string, callback: (data: any) => void) => {
        window.addEventListener(`plugin:${event}`, ((e: CustomEvent) => {
          callback(e.detail);
        }) as EventListener);
      },
      off: (event: string, callback: (data: any) => void) => {
        window.removeEventListener(
          `plugin:${event}`,
          callback as EventListener,
        );
      },
      emit: (event: string, data: any) => {
        window.dispatchEvent(
          new CustomEvent(`plugin:${event}`, { detail: data }),
        );
      },
    },
    // Expose the raw dicoogle-client instance to plugins
    dicoogle: dicoogleService.getClient() as any,
    ui: {
      showToast: (
        message: string,
        type: "info" | "success" | "warning" | "error" = "info",
      ) => {
        // Fallback to console for now - can be replaced with actual toast implementation
        const emoji = {
          info: "ℹ️",
          success: "✅",
          warning: "⚠️",
          error: "❌",
        }[type];
        console.log(`${emoji} ${message}`);
      },
    },
  };
}

/**
 * Hook to get all plugins (both enabled and disabled)
 */
export function usePlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    setPlugins(pluginRegistry.getAllPlugins());
  }, []);

  return plugins;
}

/**
 * Hook to get only enabled plugins
 */
export function useEnabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getEnabledPlugins());
    };

    updatePlugins();
    window.addEventListener("plugin-state-changed", updatePlugins);

    return () => {
      window.removeEventListener("plugin-state-changed", updatePlugins);
    };
  }, []);

  return plugins;
}

/**
 * Hook to get only disabled plugins
 */
export function useDisabledPlugins(): WebUIPlugin[] {
  const [plugins, setPlugins] = useState<WebUIPlugin[]>([]);

  useEffect(() => {
    const updatePlugins = () => {
      setPlugins(pluginRegistry.getDisabledPlugins());
    };

    updatePlugins();
    window.addEventListener("plugin-state-changed", updatePlugins);

    return () => {
      window.removeEventListener("plugin-state-changed", updatePlugins);
    };
  }, []);

  return plugins;
}

/**
 * Hook to get a specific plugin by ID
 */
export function usePlugin(id: string): WebUIPlugin | undefined {
  const [plugin, setPlugin] = useState<WebUIPlugin | undefined>();

  useEffect(() => {
    setPlugin(pluginRegistry.getPlugin(id));
  }, [id]);

  return plugin;
}

/**
 * Hook to get plugin state (enabled/disabled)
 */
export function usePluginState(id: string): PluginState | undefined {
  const [state, setState] = useState<PluginState | undefined>();

  useEffect(() => {
    const updateState = () => {
      setState(pluginRegistry.getPluginState(id));
    };

    updateState();
    window.addEventListener("plugin-state-changed", updateState);

    return () => {
      window.removeEventListener("plugin-state-changed", updateState);
    };
  }, [id]);

  return state;
}

/**
 * Hook to enable/disable plugins
 */
export function usePluginManagement() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlugin = useCallback(
    async (pluginId: string, enable: boolean) => {
      setIsLoading(true);
      setError(null);
      try {
        if (enable) {
          await enablePlugin(pluginId);
        } else {
          await disablePlugin(pluginId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { togglePlugin, isLoading, error };
}

/**
 * Get all route extensions from enabled plugins only
 */
export function getRouteExtensions(): RouteExtension[] {
  const routes: RouteExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getRouteExtensions) {
      try {
        const pluginRoutes = plugin.getRouteExtensions();
        routes.push(...pluginRoutes);
      } catch (error) {
        console.error(
          `Error getting route extensions from plugin ${plugin.metadata?.id}:`,
          error,
        );
      }
    }
  }

  return routes;
}

/**
 * Hook to get all route extensions
 */
export function useRouteExtensions(): RouteExtension[] {
  const [routes, setRoutes] = useState<RouteExtension[]>([]);

  useEffect(() => {
    const updateRoutes = () => {
      setRoutes(getRouteExtensions());
    };

    updateRoutes();
    window.addEventListener("plugin-state-changed", updateRoutes);

    return () => {
      window.removeEventListener("plugin-state-changed", updateRoutes);
    };
  }, []);

  return routes;
}

/**
 * Get all sidebar menu extensions from enabled plugins only
 */
export function getSidebarMenuExtensions(): SidebarMenuExtension[] {
  const menuItems: SidebarMenuExtension[] = [];

  const plugins = pluginRegistry.getEnabledPlugins();
  for (const plugin of plugins) {
    if (plugin.getSidebarMenuExtensions) {
      try {
        const items = plugin.getSidebarMenuExtensions();
        menuItems.push(...items);
      } catch (error) {
        console.error(
          `Error getting sidebar menu extensions from plugin ${plugin.metadata?.id}:`,
          error,
        );
      }
    }
  }

  // Sort by order if provided
  return menuItems.sort((a, b) => (a.order || 999) - (b.order || 999));
}

/**
 * Hook to get all sidebar menu extensions
 */
export function useSidebarMenuExtensions(): SidebarMenuExtension[] {
  const [items, setItems] = useState<SidebarMenuExtension[]>([]);

  useEffect(() => {
    const updateItems = () => {
      setItems(getSidebarMenuExtensions());
    };

    updateItems();
    window.addEventListener("plugin-state-changed", updateItems);

    return () => {
      window.removeEventListener("plugin-state-changed", updateItems);
    };
  }, []);

  return items;
}
